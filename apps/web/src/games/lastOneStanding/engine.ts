import { eventBus } from "@/engine/EventBus";
import { writeRoomState } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";
import type { PlayerState } from "@/engine/GameState";

/**
 * Pattern 5 — Random Elimination. Unlike the single-round patterns in
 * src/patterns/*, this one spans multiple rounds with elimination between
 * them, so it keeps its own bespoke orchestration rather than using
 * runPatternGame() — but it still writes the same unified `players` shape
 * (alive: false replaces what used to be a separate `remaining` list).
 */
export const LAST_ONE_STANDING_ID = "lastOneStanding";
export const LAST_ONE_STANDING_INSTRUCTION = "اكتب كلمة 'أنا' للبقاء";

const ROUND_OPEN_MS = 10_000;
const BETWEEN_ROUNDS_MS = 3_000;
const SURVIVE_WORD = "أنا";
const XP_REWARD = 15;

interface Participant {
  userKey: string;
  displayName: string;
}

export function startLastOneStandingGame(roomId: string, participants: Participant[]) {
  const players: Record<string, PlayerState> = {};
  for (const p of participants) players[p.userKey] = { nickname: p.displayName, score: 0, alive: true };

  let round = 0;
  let stopped = false;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  const aliveKeys = () => Object.entries(players).filter(([, p]) => p.alive).map(([key]) => key);

  async function playRound() {
    if (stopped) return;
    round += 1;
    const alive = aliveKeys();

    if (alive.length <= 1) {
      const winnerKey = alive[0] ?? null;
      if (winnerKey) players[winnerKey] = { ...players[winnerKey], score: players[winnerKey].score + 1 };
      await writeRoomState(roomId, {
        gameId: LAST_ONE_STANDING_ID,
        phase: "WINNER",
        round,
        players: { ...players },
        winner: winnerKey,
      });
      if (winnerKey) await incrementXp(winnerKey, XP_REWARD);
      return;
    }

    const endsAt = Date.now() + ROUND_OPEN_MS;
    const repliers = new Set<string>();

    await writeRoomState(roomId, {
      gameId: LAST_ONE_STANDING_ID,
      phase: "ROUND_OPEN",
      round,
      players: { ...players },
      endsAt,
      winner: null,
    });

    activeUnsubscribe = eventBus.subscribeRoom(roomId, (event) => {
      if (event.text.trim() === SURVIVE_WORD) repliers.add(event.userKey);
    });

    activeTimer = setTimeout(async () => {
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      if (stopped) return;

      const currentAlive = aliveKeys();
      const nonRepliers = currentAlive.filter((key) => !repliers.has(key));
      const pool = nonRepliers.length > 0 ? nonRepliers : currentAlive;
      const eliminated = pool[Math.floor(Math.random() * pool.length)];
      players[eliminated] = { ...players[eliminated], alive: false };

      await writeRoomState(roomId, { phase: "ELIMINATE_RANDOM", round, players: { ...players } });

      activeTimer = setTimeout(playRound, BETWEEN_ROUNDS_MS);
    }, ROUND_OPEN_MS);
  }

  playRound();

  return function stop() {
    stopped = true;
    activeUnsubscribe?.();
    if (activeTimer) clearTimeout(activeTimer);
  };
}
