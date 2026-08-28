/**
 * The one state shape every game — regardless of pattern or source — reads
 * and writes. `players` replaced separate per-game ad-hoc fields (votes,
 * remaining, scores) that older games used; `value` on a player is a
 * pattern-specific transient slot (e.g. a submitted guess) interpreted only
 * by the pattern that wrote it.
 */
export interface PlayerState {
  nickname: string;
  score: number;
  alive: boolean;
  value?: number | string | null;
}

export interface GameState {
  gameId: string;
  phase: string;
  round: number;
  players: Record<string, PlayerState>;
  target?: number | string | null;
  endsAt?: number | null;
  winner?: string | null;
  /** Vote tallies keyed by candidate label — only used by poll-style patterns. */
  tally?: Record<string, number> | null;
  /**
   * A single cumulative progress value driven by `like` events (e.g. a
   * collective goal meter). Kept separate from `target` (which patterns use
   * for a per-round secret/goal value) so a like-driven meter can persist
   * across rounds independently.
   */
  meter?: number | null;
  /** Room-level outcome for cooperative games with no individual winner (audience vs. an AI/system). */
  outcome?: "victory" | "defeat" | null;
}

export const EMPTY_GAME_STATE: GameState = {
  gameId: "",
  phase: "LOBBY",
  round: 0,
  players: {},
  target: null,
  endsAt: null,
  winner: null,
};
