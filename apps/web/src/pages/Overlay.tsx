import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { subscribeRoomState, EMPTY_ROOM_STATE, type RoomState } from "@/lib/roomState";
import { CLOSEST_GUESS_ID, CLOSEST_GUESS_INSTRUCTION } from "@/patterns/closestGuess";
import { ACCUMULATION_RACE_ID, ACCUMULATION_RACE_INSTRUCTION } from "@/patterns/accumulationRace";
import { LAST_ONE_STANDING_ID, LAST_ONE_STANDING_INSTRUCTION } from "@/games/lastOneStanding/engine";

const INSTRUCTIONS: Record<string, string> = {
  [CLOSEST_GUESS_ID]: CLOSEST_GUESS_INSTRUCTION,
  [ACCUMULATION_RACE_ID]: ACCUMULATION_RACE_INSTRUCTION,
  [LAST_ONE_STANDING_ID]: LAST_ONE_STANDING_INSTRUCTION,
};

/** Read-only, transparent-background view for OBS Browser Source capture. No auth. */
export default function Overlay() {
  const { roomId } = useParams<{ roomId: string }>();
  const [state, setState] = useState<RoomState>(EMPTY_ROOM_STATE);

  useEffect(() => {
    // OBS Browser Source only renders true transparency if <body> itself has
    // no background — the global dark theme background is set there for
    // every other route, so this route must opt out of it explicitly.
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "transparent";
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);

  useEffect(() => {
    if (!roomId) return;
    return subscribeRoomState(roomId, setState);
  }, [roomId]);

  const instruction = INSTRUCTIONS[state.gameId] ?? null;
  const isTerminalPhase = state.phase === "WINNER" || state.phase === "FINISHED";

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-8">
      <div className="text-center space-y-3 text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]">
        {instruction && state.phase !== "LOBBY" ? (
          <>
            <p className="text-3xl font-display">{instruction}</p>
            {isTerminalPhase && state.winner && (
              <p className="text-2xl font-bold text-yellow-300">
                🏆 {state.players[state.winner]?.nickname ?? state.winner}
              </p>
            )}
          </>
        ) : (
          <p className="text-xl opacity-70">بانتظار بدء اللعبة...</p>
        )}
      </div>
    </div>
  );
}
