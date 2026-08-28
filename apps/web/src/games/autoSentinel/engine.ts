import { eventBus } from "@/engine/EventBus";
import { writeRoomState } from "@/lib/roomState";
import { incrementXp, isRegisteredUserKey } from "@/lib/users";
import type { PlayerState } from "@/engine/GameState";

/**
 * "الحارس الآلي" — cooperative: the whole audience votes a port each round
 * to fire at a shield. The shield isn't a fixed-odds RNG — it keeps a
 * rolling histogram of the last few winning ports and is biased to block
 * whichever port the crowd has favored most, so repeating the same vote
 * gets punished over time. No individual winner: the room either defeats
 * the shield together (victory) or runs out of rounds (defeat).
 */
export const AUTO_SENTINEL_ID = "autoSentinel";
export const AUTO_SENTINEL_INSTRUCTION = "صوّتوا برقم المنفذ (1-5) لضرب درع الحارس — نوّعوا اختياركم عشان ما يتوقعكم!";

const PORTS = 5;
const ROUND_MS = 7_000;
const BETWEEN_ROUNDS_MS = 2_000;
const SHIELD_HEALTH = 5;
const MAX_ROUNDS = 12;
const HISTOGRAM_WINDOW = 5;
const BLOCK_BIAS = 0.6;
const LIKE_BONUS_THRESHOLD = 80;
const XP_REWARD = 15;

interface Participant {
  userKey: string;
  displayName: string;
}

export function startAutoSentinelGame(roomId: string, participants: Participant[]) {
  const players: Record<string, PlayerState> = {};
  for (const p of participants) players[p.userKey] = { nickname: p.displayName, score: 0, alive: true };

  let round = 0;
  let shieldHealth = SHIELD_HEALTH;
  let meter = 0;
  let likeBonusUsed = false;
  let stopped = false;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  const history: number[] = [];
  let votes = new Map<string, number>();
  let doubleShot = false;

  function mostFrequentInHistory(): number | null {
    if (history.length === 0) return null;
    const counts = new Map<number, number>();
    for (const port of history) counts.set(port, (counts.get(port) ?? 0) + 1);
    let best: number | null = null;
    let bestCount = -1;
    for (const [port, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = port;
      }
    }
    return best;
  }

  async function finish(outcome: "victory" | "defeat") {
    if (outcome === "victory") {
      for (const uid of Object.keys(players)) {
        if (isRegisteredUserKey(uid)) await incrementXp(uid, XP_REWARD);
      }
    }
    await writeRoomState(roomId, {
      gameId: AUTO_SENTINEL_ID,
      phase: "FINISHED",
      round,
      players: { ...players },
      target: shieldHealth,
      outcome,
      winner: null,
      meter,
      endsAt: null,
    });
  }

  async function playRound() {
    if (stopped) return;
    round += 1;

    if (shieldHealth <= 0) {
      await finish("victory");
      return;
    }
    if (round > MAX_ROUNDS) {
      await finish("defeat");
      return;
    }

    votes = new Map();
    doubleShot = false;
    const endsAt = Date.now() + ROUND_MS;
    await writeRoomState(roomId, {
      gameId: AUTO_SENTINEL_ID,
      phase: "VOTING",
      round,
      players: { ...players },
      target: shieldHealth,
      endsAt,
      winner: null,
      outcome: null,
      meter,
    });

    activeUnsubscribe = eventBus.subscribeRoom(roomId, (event) => {
      if (event.kind === "gift") {
        doubleShot = true;
        return;
      }
      if (event.kind === "like") {
        meter += 1;
        return;
      }
      // follow: intentionally no mechanical effect in this pattern — not
      // every event needs a lever, and forcing one here would muddy the
      // read on what the vote+gift+like combo is actually doing.
      if (event.kind !== "comment") return;
      const port = Number.parseInt(event.text.trim(), 10);
      if (!Number.isFinite(port) || port < 1 || port > PORTS) return;
      votes.set(event.userKey, port);
      if (!players[event.userKey]) players[event.userKey] = { nickname: event.displayName, score: 0, alive: true };
    });

    activeTimer = setTimeout(async () => {
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      if (stopped) return;

      const counts = new Map<number, number>();
      for (const port of votes.values()) counts.set(port, (counts.get(port) ?? 0) + 1);
      let majorityPort: number | null = null;
      let bestCount = -1;
      for (const [port, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          majorityPort = port;
        }
      }

      let hit = false;
      if (majorityPort != null) {
        const blockedPort = mostFrequentInHistory();
        const blocked = !doubleShot && blockedPort != null && blockedPort === majorityPort && Math.random() < BLOCK_BIAS;
        hit = !blocked;
        history.push(majorityPort);
        if (history.length > HISTOGRAM_WINDOW) history.shift();
      }

      if (hit) shieldHealth -= 1;
      if (!likeBonusUsed && meter >= LIKE_BONUS_THRESHOLD) {
        shieldHealth -= 1;
        likeBonusUsed = true;
      }

      for (const uid of votes.keys()) {
        if (players[uid]) players[uid] = { ...players[uid], score: players[uid].score + 1 };
      }

      const tally: Record<string, number> = {};
      for (const [port, count] of counts) tally[String(port)] = count;

      await writeRoomState(roomId, {
        phase: hit ? "HIT" : "MISS",
        round,
        players: { ...players },
        target: shieldHealth,
        tally,
        meter,
      });

      if (shieldHealth <= 0) {
        await finish("victory");
        return;
      }
      if (round >= MAX_ROUNDS) {
        await finish("defeat");
        return;
      }
      activeTimer = setTimeout(playRound, BETWEEN_ROUNDS_MS);
    }, ROUND_MS);
  }

  playRound();

  return function stop() {
    stopped = true;
    activeUnsubscribe?.();
    if (activeTimer) clearTimeout(activeTimer);
  };
}
