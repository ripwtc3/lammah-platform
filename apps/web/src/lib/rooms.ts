import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { roomCode } from "@/lib/utils";

export type LivePlatform = "twitch" | "youtube" | "tiktok";

export interface PlatformConfig {
  channel?: string; // twitch channel name / tiktok username
  videoId?: string; // youtube live video id
  apiKey?: string; // youtube API key (user-supplied, stored per-room)
}

export interface RoomDoc {
  code: string;
  hostUid: string;
  gameId: string;
  mode: "local" | "live";
  platform: LivePlatform | null;
  platformConfig: PlatformConfig | null;
  status: "lobby" | "active" | "ended";
  createdAt?: unknown;
}

export async function createRoom(
  hostUid: string,
  hostDisplayName: string,
  live?: { platform: LivePlatform; config: PlatformConfig },
): Promise<string> {
  const code = roomCode();
  const ref = doc(collection(db, "rooms"));
  const data: RoomDoc = {
    code,
    hostUid,
    gameId: "",
    mode: live ? "live" : "local",
    platform: live?.platform ?? null,
    platformConfig: live?.config ?? null,
    status: "lobby",
  };
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  await setDoc(doc(db, "rooms", ref.id, "participants", hostUid), {
    displayName: hostDisplayName,
    role: "host",
    joinedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function findRoomByCode(code: string): Promise<string | null> {
  const q = query(collection(db, "rooms"), where("code", "==", code.toUpperCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function joinRoom(roomId: string, uid: string, displayName: string) {
  await setDoc(
    doc(db, "rooms", roomId, "participants", uid),
    { displayName, role: "participant", joinedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function getRoom(roomId: string): Promise<RoomDoc | null> {
  const snap = await getDoc(doc(db, "rooms", roomId));
  return snap.exists() ? (snap.data() as RoomDoc) : null;
}

export interface Participant {
  userKey: string;
  displayName: string;
  role: string;
}

export function subscribeParticipants(roomId: string, callback: (participants: Participant[]) => void) {
  return onSnapshot(collection(db, "rooms", roomId, "participants"), (snap) => {
    callback(snap.docs.map((d) => ({ userKey: d.id, displayName: d.data().displayName, role: d.data().role })));
  });
}
