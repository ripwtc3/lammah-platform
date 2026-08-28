import { eventBus } from "@/engine/EventBus";
import { writeRoomState } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";
import type { PlayerState } from "@/engine/GameState";

/**
 * "نبض القبو" — herd-avoidance heist. Every round each player picks a
 * corridor; the more players cluster on one corridor, the more likely THAT
 * corridor triggers the alarm (weighted random draw, not a fixed trap) —
 * unlike simple random elimination, players are punished for predictability.
 */
export const VAULT_PULSE_ID = "vaultPulse";
export const VAULT_PULSE_INSTRUCTION = "اكتب رقم الممر (1، 2، أو 3) — كل ما اخترت نفس ممر ناس أكثر، زاد خطر الإنذار عليه";

const CORRIDORS = 3;
const CHOOSING_MS = 8_000;
const BETWEEN_ROUNDS_MS = 2_500;
const MAX_ROUNDS = 10;
const LIKE_METER_THRESHOLD = 60;
const XP_REWARD = 20;

interface Participant {
  userKey: string;
  displayName: string;
}

export function startVaultPulseGame(roomId: string, participants: Participant[]) {
  const players: Record<string, PlayerState> = {};
  for (const p of participants) players[p.userKey] = { nickname: p.displayName, score: 0, alive: true, value: null };

  let round = 0;
  let meter = 0;
  let stopped = false;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  const reentryTokens = new Set<string>();
  const immuneThisRound = new Set<string>();

  const aliveKeys = () => Object.entries(players).filter(([, p]) => p.alive).map(([key]) => key);

  function pickAlarmCorridor(counts: number[]): number {
    const weights = counts.map((c) => c + 1); // floor weight — every corridor keeps some risk
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i + 1;
    }
    return weights.length;
  }

  function bestAliveByScore(): string | null {
    const alive = aliveKeys();
    if (alive.length === 0) return null;
    return alive.reduce((best, key) => (players[key].score > players[best].score ? key : best), alive[0]);
  }

  async function finishGame(winnerKey: string | null) {
    await writeRoomState(roomId, { gameId: VAULT_PULSE_ID, phase: "WINNER", round, players: { ...players }, winner: winnerKey, meter, endsAt: null });
    if (winnerKey) await incrementXp(winnerKey, XP_REWARD);
  }

  async function playRound() {
    if (stopped) return;
    round += 1;
    immuneThisRound.clear();

    const alive = aliveKeys();
    if (alive.length <= 1) {
      await finishGame(alive[0] ?? null);
      return;
    }
    if (round > MAX_ROUNDS) {
      await finishGame(bestAliveByScore());
      return;
    }

    for (const key of alive) players[key] = { ...players[key], value: null };
    const endsAt = Date.now() + CHOOSING_MS;
    await writeRoomState(roomId, {
      gameId: VAULT_PULSE_ID,
      phase: "CHOOSING",
      round,
      players: { ...players },
      target: CORRIDORS,
      endsAt,
      winner: null,
      meter,
    });

    activeUnsubscribe = eventBus.subscribeRoom(roomId, (event) => {
      if (event.kind === "gift") {
        if (players[event.userKey]) immuneThisRound.add(event.userKey);
        return;
      }
      if (event.kind === "like") {
        meter = Math.min(LIKE_METER_THRESHOLD, meter + 1);
        return;
      }
      if (event.kind === "follow") {
        reentryTokens.add(event.userKey);
        return;
      }
      const p = players[event.userKey];
      if (!p || !p.alive || p.value != null) return;
      const choice = Number.parseInt(event.text.trim(), 10);
      if (!Number.isFinite(choice) || choice < 1 || choice > CORRIDORS) return;
      players[event.userKey] = { ...p, value: choice };
    });

    activeTimer = setTimeout(async () => {
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      if (stopped) return;

      if (meter >= LIKE_METER_THRESHOLD) {
        await finishGame(bestAliveByScore());
        return;
      }

      const counts = new Array(CORRIDORS).fill(0);
      for (const key of alive) {
        const v = players[key].value;
        if (typeof v === "number") counts[v - 1] += 1;
      }
      const alarmCorridor = pickAlarmCorridor(counts);

      for (const key of alive) {
        const p = players[key];
        if (p.value === alarmCorridor && !immuneThisRound.has(key)) {
          if (reentryTokens.has(key)) {
            reentryTokens.delete(key); // saved once — consumed
          } else {
            players[key] = { ...p, alive: false };
          }
        } else if (p.value != null) {
          players[key] = { ...p, score: p.score + 1 };
        }
      }

      await writeRoomState(roomId, { phase: "RESOLVING", round, players: { ...players }, target: alarmCorridor, meter });
      activeTimer = setTimeout(playRound, BETWEEN_ROUNDS_MS);
    }, CHOOSING_MS);
  }

  playRound();

  return function stop() {
    stopped = true;
    activeUnsubscribe?.();
    if (activeTimer) clearTimeout(activeTimer);
  };
}
