import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { eventBus } from "@/engine/EventBus";
import type { ChatEvent } from "@/engine/ChatEvent";

/**
 * Local-room mode has no external stream: participants' own devices ARE the
 * chat. Each sent message is written to Firestore, and every device
 * (including the sender) picks it back up via onSnapshot and republishes it
 * onto the shared EventBus — so game engines treat it identically to a
 * Twitch/TikTok/etc. message.
 */
export function startLocalAdapter(roomId: string): () => void {
  const messagesRef = collection(db, "rooms", roomId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  const seen = new Set<string>();
  const unsubscribe = onSnapshot(q, (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type !== "added") continue;
      if (seen.has(change.doc.id)) continue;
      seen.add(change.doc.id);

      const data = change.doc.data();
      const createdAt = data.createdAt as Timestamp | null;
      const event: ChatEvent = {
        id: change.doc.id,
        source: "local",
        roomId,
        userKey: data.userKey,
        displayName: data.displayName,
        text: data.text,
        timestamp: createdAt ? createdAt.toMillis() : Date.now(),
        kind: "comment",
      };
      eventBus.publish(event);
    }
  });

  return unsubscribe;
}

export async function sendLocalMessage(roomId: string, userKey: string, displayName: string, text: string) {
  const messagesRef = collection(db, "rooms", roomId, "messages");
  await addDoc(messagesRef, {
    userKey,
    displayName,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
}
