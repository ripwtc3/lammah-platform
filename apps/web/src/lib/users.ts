import { collection, doc, getDocs, increment, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Only local-room userKeys are bare Firebase uids (see sendLocalMessage) —
 * live-platform chat participants (twitch:name, tiktok:name, youtube:id)
 * aren't registered accounts, so their "wins" can't and shouldn't touch
 * users/{uid} docs. This is the same prefix convention used throughout the
 * adapters, so a colon reliably distinguishes the two.
 */
export function isRegisteredUserKey(userKey: string): boolean {
  return !userKey.includes(":");
}

export async function incrementXp(uid: string, amount: number) {
  if (!isRegisteredUserKey(uid)) return;
  await updateDoc(doc(db, "users", uid), { xp: increment(amount) });
}

export interface LeaderboardEntry {
  uid: string;
  display_name: string;
  xp: number;
  level: number;
}

export async function fetchLeaderboard(topN = 20): Promise<LeaderboardEntry[]> {
  const q = query(collection(db, "users"), orderBy("xp", "desc"), limit(topN));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<LeaderboardEntry, "uid">) }));
}
