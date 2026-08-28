import { eventBus } from "@/engine/EventBus";
import { writeRoomState } from "@/lib/roomState";
import { writeHint, clearHint } from "@/lib/hints";
import { incrementXp } from "@/lib/users";
import type { PlayerState } from "@/engine/GameState";

/**
 * "مصعد الحظ" — each floor has one safe door of two; a collective like-meter
 * fills a shared safety net that (once full) downgrades every future miss
 * from elimination to "drop one floor" instead. A gift buys the sender a
 * private hint for that floor — delivered over rooms/{id}/hints/{uid}, which
 * only that uid can read (see firestore.rules), never the shared room state.
 */
export const FORTUNE_ELEVATOR_ID = "fortuneElevator";
export const FORTUNE_ELEVATOR_INSTRUCTION = "اكتب 1 أو 2 لاختيار الباب — أول من يوصل القمة يفوز";

const FLOORS = 6;
const FLOOR_MS = 8_000;
const BETWEEN_FLOORS_MS = 2_500;
const SAFETY_NET_THRESHOLD = 40;
const XP_REWARD = 22;

interface Participant {
  userKey: string;
  displayName: string;
}

export function startFortuneElevatorGame(roomId: string, participants: Participant[]) {
  const players: Record<string, PlayerState> = {};
  for (const p of participants) players[p.userKey] = { nickname: p.displayName, score: 0, alive: true, value: null };

  let round = 0;
  let meter = 0;
  let stopped = false;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  const aliveKeys = () => Object.entries(players).filter(([, p]) => p.alive).map(([key]) => key);

  async function clearAllHints() {
    await Promise.all(Object.keys(players).map((uid) => clearHint(roomId, uid)));
  }

  function topFloorReached(): string | null {
    return Object.entries(players).find(([, p]) => p.alive && p.score >= FLOORS)?.[0] ?? null;
  }

  function bestAlive(): string | null {
    const alive = aliveKeys();
    if (alive.length === 0) return null;
    return alive.reduce((best, key) => (players[key].score > players[best].score ? key : best), alive[0]);
  }

  async function finishGame(winnerKey: string | null) {
    await clearAllHints();
    await writeRoomState(roomId, { gameId: FORTUNE_ELEVATOR_ID, phase: "WINNER", round, players: { ...players }, winner: winnerKey, meter, endsAt: null });
    if (winnerKey) await incrementXp(winnerKey, XP_REWARD);
  }

  async function playFloor() {
    if (stopped) return;
    round += 1;

    const winner = topFloorReached();
    if (winner) {
      await finishGame(winner);
      return;
    }
    const alive = aliveKeys();
    if (alive.length === 0) {
      await finishGame(bestAlive());
      return;
    }

    for (const key of alive) players[key] = { ...players[key], value: null };

    const safeDoor = Math.random() < 0.5 ? 1 : 2;
    const endsAt = Date.now() + FLOOR_MS;
    await writeRoomState(roomId, {
      gameId: FORTUNE_ELEVATOR_ID,
      phase: "CLIMBING",
      round,
      players: { ...players },
      target: FLOORS,
      endsAt,
      winner: null,
      meter,
    });

    activeUnsubscribe = eventBus.subscribeRoom(roomId, (event) => {
      const p = players[event.userKey];
      if (event.kind === "gift") {
        if (p?.alive) void writeHint(roomId, event.userKey, `الباب الآمن هذا الدور: ${safeDoor}`);
        return;
      }
      if (event.kind === "like") {
        meter = Math.min(SAFETY_NET_THRESHOLD, meter + 1);
        return;
      }
      if (event.kind === "follow") {
        if (!players[event.userKey]) {
          players[event.userKey] = { nickname: event.displayName, score: 1, alive: true, value: null }; // enters at floor 2
        }
        return;
      }
      if (!p || !p.alive || p.value != null) return;
      const choice = Number.parseInt(event.text.trim(), 10);
      if (choice !== 1 && choice !== 2) return;
      players[event.userKey] = { ...p, value: choice };
    });

    activeTimer = setTimeout(async () => {
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      if (stopped) return;

      const safetyNetActive = meter >= SAFETY_NET_THRESHOLD;
      for (const key of aliveKeys()) {
        const p = players[key];
        if (p.value == null) continue; // no answer: stays put, no progress
        if (p.value === safeDoor) {
          players[key] = { ...p, score: p.score + 1 };
        } else if (safetyNetActive) {
          players[key] = { ...p, score: Math.max(0, p.score - 1) };
        } else {
          players[key] = { ...p, alive: false };
        }
      }

      await clearAllHints();
      await writeRoomState(roomId, { phase: "REVEAL_FLOOR", round, players: { ...players }, target: safeDoor, meter });
      activeTimer = setTimeout(playFloor, BETWEEN_FLOORS_MS);
    }, FLOOR_MS);
  }

  playFloor();

  return function stop() {
    stopped = true;
    activeUnsubscribe?.();
    if (activeTimer) clearTimeout(activeTimer);
  };
}
