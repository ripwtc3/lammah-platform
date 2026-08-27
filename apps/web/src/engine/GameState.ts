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
