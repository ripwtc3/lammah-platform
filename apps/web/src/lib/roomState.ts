import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { EMPTY_GAME_STATE, type GameState } from "@/engine/GameState";

export type RoomState = GameState;
export const EMPTY_ROOM_STATE = EMPTY_GAME_STATE;

function stateRef(roomId: string) {
  return doc(db, "rooms", roomId, "state", "current");
}

export function subscribeRoomState(roomId: string, callback: (state: RoomState) => void): () => void {
  return onSnapshot(stateRef(roomId), (snap) => {
    callback(snap.exists() ? (snap.data() as RoomState) : EMPTY_ROOM_STATE);
  });
}

/** Only the room's host/referee has write access here (see firestore.rules) — call only from host UI code. */
export async function writeRoomState(roomId: string, patch: Partial<RoomState>) {
  await setDoc(stateRef(roomId), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
