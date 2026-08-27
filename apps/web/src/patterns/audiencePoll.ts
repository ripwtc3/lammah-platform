import type { GamePattern } from "@/engine/patternEngine";

/**
 * Pattern 4 — Direct Audience Poll ("لجنة الجمهور"): the host names N
 * candidates up front; a chat message that exactly matches a candidate is
 * one vote for it. Most votes when time runs out wins.
 *
 * No xpReward on purpose: the "winner" here is a candidate label, not a
 * user id, and incrementXp() must only ever be called with a real uid
 * (see lib/users.ts isRegisteredUserKey) — awarding XP would either no-op
 * silently or, worse, write a bogus users/{candidateLabel} document.
 */
export const AUDIENCE_POLL_ID = "audiencePoll";
export const AUDIENCE_POLL_INSTRUCTION = "صوّت بكتابة اسم خيارك بالضبط كما هو مكتوب";
const DURATION_MS = 30_000;

export function createAudiencePoll(candidates: string[]): GamePattern {
  const normalized = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];

  return {
    id: AUDIENCE_POLL_ID,
    instruction: AUDIENCE_POLL_INSTRUCTION,
    durationMs: DURATION_MS,

    init: (round) => ({
      gameId: AUDIENCE_POLL_ID,
      phase: "VOTING",
      round,
      players: {},
      target: normalized.join(" · "),
      endsAt: Date.now() + DURATION_MS,
      winner: null,
      tally: Object.fromEntries(normalized.map((c) => [c, 0])),
    }),

    onEvent: (event, state) => {
      if (state.phase !== "VOTING") return null;
      if (state.players[event.userKey]) return null; // one vote per user

      const text = event.text.trim();
      const candidate = normalized.find((c) => c === text);
      if (!candidate) return null;

      const tally = { ...(state.tally || {}) };
      tally[candidate] = (tally[candidate] ?? 0) + 1;

      return {
        patch: {
          tally,
          players: {
            ...state.players,
            [event.userKey]: { nickname: event.displayName, score: 0, alive: true, value: candidate },
          },
        },
      };
    },

    onTimeout: (state) => {
      const tally = state.tally || {};
      let winner: string | null = null;
      let best = -1;
      for (const [candidate, count] of Object.entries(tally)) {
        if (count > best) {
          best = count;
          winner = candidate;
        }
      }
      return { phase: "RESULT", winner };
    },
  };
}
