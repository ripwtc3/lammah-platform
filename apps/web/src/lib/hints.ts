import { doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * A per-user private channel — unlike room state, this is NOT world-readable
 * (see firestore.rules: rooms/{roomId}/hints/{uid}). Used for gift-earned
 * information that must stay hidden from every other viewer, including the
 * overlay/spectators.
 */
export async function writeHint(roomId: string, uid: string, hint: string) {
  await setDoc(doc(db, "rooms", roomId, "hints", uid), { hint, updatedAt: Date.now() });
}

export async function clearHint(roomId: string, uid: string) {
  await deleteDoc(doc(db, "rooms", roomId, "hints", uid)).catch(() => undefined);
}

export function subscribeHint(roomId: string, uid: string, callback: (hint: string | null) => void) {
  return onSnapshot(doc(db, "rooms", roomId, "hints", uid), (snap) => {
    callback(snap.exists() ? (snap.data().hint as string) : null);
  });
}
