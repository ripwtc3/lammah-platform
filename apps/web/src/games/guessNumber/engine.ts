import { eventBus } from "@/engine/EventBus";
import { writeRoomState, incrementScore } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";

export const GUESS_NUMBER_ID = "guessNumber";
export const GUESS_NUMBER_INSTRUCTION = "اكتب رقم من 1 إلى 100";

const COLLECTING_MS = 30_000;

/**
 * Host-only controller: LOBBY -> COLLECTING -> REVEAL -> SCORED -> LOBBY.
 * Runs entirely on the host's client (only the host can write room state —
 * see firestore.rules), listening to the shared EventBus for guesses
 * regardless of whether they came from Twitch/TikTok/local chat/etc.
 * Returns a stop() function to tear down the round early.
 */
export function startGuessNumberRound(roomId: string, round: number) {
  const secretNumber = 1 + Math.floor(Math.random() * 100);
  const endsAt = Date.now() + COLLECTING_MS;
  const guesses = new Map<string, { displayName: string; value: number }>();

  writeRoomState(roomId, {
    gameId: GUESS_NUMBER_ID,
    phase: "COLLECTING",
    round,
    votes: {},
    // Firestore rejects `undefined`, and setDoc(merge:true) would otherwise
    // leave a *previous* round's secretNumber sitting in the doc — null
    // both satisfies the SDK and actually clears it before clients read it.
    secretNumber: null,
    endsAt,
    winner: null,
  });

  const unsubscribe = eventBus.subscribeRoom(roomId, (event) => {
    if (guesses.has(event.userKey)) return; // first guess only
    const value = Number.parseInt(event.text.trim(), 10);
    if (!Number.isFinite(value) || value < 1 || value > 100) return;
    guesses.set(event.userKey, { displayName: event.displayName, value });
  });

  const timer = setTimeout(async () => {
    unsubscribe();

    let winnerKey: string | null = null;
    let winnerDistance = Infinity;
    for (const [userKey, guess] of guesses) {
      const distance = Math.abs(guess.value - secretNumber);
      if (distance < winnerDistance) {
        winnerDistance = distance;
        winnerKey = userKey;
      }
    }

    const votesRecord = Object.fromEntries(
      [...guesses.entries()].map(([key, g]) => [key, { displayName: g.displayName, value: g.value }]),
    );

    await writeRoomState(roomId, {
      phase: "REVEAL",
      round,
      votes: votesRecord,
      secretNumber,
      winner: winnerKey,
    });

    if (winnerKey) {
      await incrementScore(roomId, winnerKey, 1);
      await incrementXp(winnerKey, 10);
    }
  }, COLLECTING_MS);

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}
