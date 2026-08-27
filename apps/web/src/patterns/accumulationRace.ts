import type { GamePattern } from "@/engine/patternEngine";

/**
 * Pattern 1 — Accumulation Race ("تسلّق الجبل" / Mountain Climb): each valid
 * message climbs the sender one step; first to the summit wins outright,
 * otherwise the highest climber wins when time runs out.
 */
export const ACCUMULATION_RACE_ID = "accumulationRace";
export const ACCUMULATION_RACE_INSTRUCTION = "اكتب 'قمة' للصعود درجة — أول من يوصل القمة يفوز";
const DURATION_MS = 45_000;
const CLIMB_TARGET = 5;
const KEYWORD = "قمة";

export const accumulationRacePattern: GamePattern = {
  id: ACCUMULATION_RACE_ID,
  instruction: ACCUMULATION_RACE_INSTRUCTION,
  durationMs: DURATION_MS,
  xpReward: 12,

  init: (round) => ({
    gameId: ACCUMULATION_RACE_ID,
    phase: "ACTIVE",
    round,
    players: {},
    target: CLIMB_TARGET,
    endsAt: Date.now() + DURATION_MS,
    winner: null,
  }),

  onEvent: (event, state) => {
    if (state.phase !== "ACTIVE") return null;
    if (event.text.trim() !== KEYWORD) return null;

    const nextScore = (state.players[event.userKey]?.score ?? 0) + 1;
    const players = {
      ...state.players,
      [event.userKey]: { nickname: event.displayName, score: nextScore, alive: true },
    };

    if (nextScore >= CLIMB_TARGET) {
      return { patch: { players, phase: "FINISHED", winner: event.userKey }, endRound: true };
    }
    return { patch: { players } };
  },

  onTimeout: (state) => {
    let winnerKey: string | null = null;
    let best = -1;
    for (const [uid, player] of Object.entries(state.players)) {
      if (player.score > best) {
        best = player.score;
        winnerKey = uid;
      }
    }
    return { phase: "FINISHED", winner: winnerKey };
  },
};
