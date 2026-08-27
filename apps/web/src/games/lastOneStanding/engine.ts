import { eventBus } from "@/engine/EventBus";
import { writeRoomState, incrementScore } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";

export const LAST_ONE_STANDING_ID = "lastOneStanding";
export const LAST_ONE_STANDING_INSTRUCTION = "اكتب كلمة 'أنا' للبقاء";

const ROUND_OPEN_MS = 10_000;
const BETWEEN_ROUNDS_MS = 3_000;
const SURVIVE_WORD = "أنا";

interface Participant {
  userKey: string;
  displayName: string;
}

/**
 * Host-only controller: LOBBY -> ROUND_OPEN -> ELIMINATE_RANDOM -> CHECK_REMAINING
 * -> loop, or WINNER once one participant remains. Each round eliminates one
 * random participant among those who did NOT reply "أنا" in time; if everyone
 * replied, eliminates one random participant anyway so the game always ends.
 */
export function startLastOneStandingGame(roomId: string, participants: Participant[]) {
  let remaining = [...participants];
  let round = 0;
  let stopped = false;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  async function playRound() {
    if (stopped) return;
    round += 1;

    if (remaining.length <= 1) {
      const winner = remaining[0] ?? null;
      await writeRoomState(roomId, {
        gameId: LAST_ONE_STANDING_ID,
        phase: "WINNER",
        round,
        remaining: remaining.map((p) => p.userKey),
        winner: winner?.userKey ?? null,
      });
      if (winner) {
        await incrementScore(roomId, winner.userKey, 1);
        await incrementXp(winner.userKey, 15);
      }
      return;
    }

    const endsAt = Date.now() + ROUND_OPEN_MS;
    const repliers = new Set<string>();

    await writeRoomState(roomId, {
      gameId: LAST_ONE_STANDING_ID,
      phase: "ROUND_OPEN",
      round,
      remaining: remaining.map((p) => p.userKey),
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

      const nonRepliers = remaining.filter((p) => !repliers.has(p.userKey));
      const eliminationPool = nonRepliers.length > 0 ? nonRepliers : remaining;
      const eliminated = eliminationPool[Math.floor(Math.random() * eliminationPool.length)];
      remaining = remaining.filter((p) => p.userKey !== eliminated.userKey);

      await writeRoomState(roomId, {
        phase: "ELIMINATE_RANDOM",
        round,
        remaining: remaining.map((p) => p.userKey),
      });

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

export function displayNameFor(participants: Participant[], userKey: string): string {
  return participants.find((p) => p.userKey === userKey)?.displayName ?? userKey;
}
