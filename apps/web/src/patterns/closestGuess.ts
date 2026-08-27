import type { GamePattern } from "@/engine/patternEngine";

/** Pattern 3 — Closest Guess: secret number, one guess per player, closest at the deadline wins. */
export const CLOSEST_GUESS_ID = "closestGuess";
export const CLOSEST_GUESS_INSTRUCTION = "اكتب رقم من 1 إلى 100";
const DURATION_MS = 30_000;

export const closestGuessPattern: GamePattern = {
  id: CLOSEST_GUESS_ID,
  instruction: CLOSEST_GUESS_INSTRUCTION,
  durationMs: DURATION_MS,
  xpReward: 10,

  init: (round) => ({
    gameId: CLOSEST_GUESS_ID,
    phase: "COLLECTING",
    round,
    players: {},
    target: 1 + Math.floor(Math.random() * 100),
    endsAt: Date.now() + DURATION_MS,
    winner: null,
  }),

  onEvent: (event, state) => {
    if (state.phase !== "COLLECTING") return null;
    if (state.players[event.userKey]?.value != null) return null; // first guess only

    const value = Number.parseInt(event.text.trim(), 10);
    if (!Number.isFinite(value) || value < 1 || value > 100) return null;

    return {
      patch: {
        players: {
          ...state.players,
          [event.userKey]: {
            nickname: event.displayName,
            score: state.players[event.userKey]?.score ?? 0,
            alive: true,
            value,
          },
        },
      },
    };
  },

  onTimeout: (state) => {
    let winnerKey: string | null = null;
    let bestDistance = Infinity;
    for (const [uid, player] of Object.entries(state.players)) {
      if (typeof player.value !== "number") continue;
      const distance = Math.abs(player.value - (state.target as number));
      if (distance < bestDistance) {
        bestDistance = distance;
        winnerKey = uid;
      }
    }

    const players = { ...state.players };
    if (winnerKey) players[winnerKey] = { ...players[winnerKey], score: players[winnerKey].score + 1 };

    return { phase: "REVEAL", winner: winnerKey, players };
  },
};
