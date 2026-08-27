import { doc, onSnapshot, setDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface RoomState {
  gameId: string;
  phase: string;
  round: number;
  votes: Record<string, unknown>;
  scores: Record<string, number>;
  remaining: string[];
  winner: string | null;
  secretNumber?: number | null;
  endsAt?: number;
  updatedAt?: unknown;
}

export const EMPTY_ROOM_STATE: RoomState = {
  gameId: "",
  phase: "LOBBY",
  round: 0,
  votes: {},
  scores: {},
  remaining: [],
  winner: null,
};

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

/**
 * Atomically bumps scores.<userKey> by `by`. Uses updateDoc + increment()
 * (not setDoc merge, which does NOT treat dotted keys as nested paths).
 * The doc must already exist — callers always writeRoomState() first in a round.
 */
export async function incrementScore(roomId: string, userKey: string, by = 1) {
  await updateDoc(stateRef(roomId), {
    [`scores.${userKey}`]: increment(by),
    updatedAt: serverTimestamp(),
  });
}
