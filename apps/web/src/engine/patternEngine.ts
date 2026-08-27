import { eventBus } from "@/engine/EventBus";
import { RoundTimer } from "@/engine/RoundTimer";
import type { GameState } from "@/engine/GameState";
import type { ChatEvent } from "@/engine/ChatEvent";
import { writeRoomState } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";

export interface PatternEventResult {
  /** Partial GameState to merge (deep-merges into players, per Firestore setDoc merge semantics). */
  patch?: Partial<GameState>;
  /** End the round immediately (e.g. Pattern 2 "first correct answer", or a race threshold reached). */
  endRound?: boolean;
}

/**
 * A "pattern" is a single-round game reduced to three hooks — it owns no
 * subscription, no timer, and no Firestore calls itself. That plumbing is
 * shared by runPatternGame() below, so a new game is just a new pattern
 * module (see src/patterns/*), never a re-implementation of chat handling.
 */
export interface GamePattern {
  id: string;
  instruction: string;
  durationMs: number;
  /** Global XP awarded to state.winner when the round ends, if any. */
  xpReward?: number;
  init: (round: number) => GameState;
  onEvent: (event: ChatEvent, state: GameState) => PatternEventResult | null;
  /** Called when the round timer expires, for patterns that resolve at the deadline (e.g. closest guess). */
  onTimeout?: (state: GameState) => Partial<GameState>;
}

export function runPatternGame(roomId: string, pattern: GamePattern, round: number): () => void {
  let state = pattern.init(round);
  void writeRoomState(roomId, state);

  const timer = new RoundTimer();
  let stopped = false;
  let unsubscribe: (() => void) | null = null;

  function finish() {
    if (stopped) return;
    stopped = true;
    unsubscribe?.();
    timer.stop();
    if (pattern.xpReward && state.winner) {
      void incrementXp(state.winner, pattern.xpReward);
    }
  }

  unsubscribe = eventBus.subscribeRoom(roomId, (event) => {
    const result = pattern.onEvent(event, state);
    if (!result) return;
    if (result.patch) {
      state = { ...state, ...result.patch };
      void writeRoomState(roomId, result.patch);
    }
    if (result.endRound) finish();
  });

  if (pattern.onTimeout) {
    timer.start(pattern.durationMs, () => {
      const patch = pattern.onTimeout!(state);
      state = { ...state, ...patch };
      void writeRoomState(roomId, patch);
      finish();
    });
  }

  return finish;
}
