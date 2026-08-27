import { collection, doc, setDoc, onSnapshot, serverTimestamp, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type TeamKey = "teamA" | "teamB";

export interface MatchDoc {
  name: string;
  teams: [string, string]; // [teamA name, teamB name]
  scores: Record<TeamKey, number>;
  status: "active" | "ended";
  hostUid: string;
  refereeUid: string | null;
  // Anyone holding this link can claim the referee role (first come, first
  // served — Firestore rules can't keep a document field secret from a
  // client that can already read the doc, so real access control for the
  // referee role would need a Cloud Function; out of scope for this MVP).
  refereeToken: string;
  createdAt?: unknown;
}

function randomToken(): string {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export async function createMatch(hostUid: string, name: string, teamA: string, teamB: string) {
  const ref = doc(collection(db, "matches"));
  const refereeToken = randomToken();
  const data: MatchDoc = {
    name,
    teams: [teamA, teamB],
    scores: { teamA: 0, teamB: 0 },
    status: "active",
    hostUid,
    refereeUid: null,
    refereeToken,
  };
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export function subscribeMatch(matchId: string, callback: (match: (MatchDoc & { id: string }) | null) => void) {
  return onSnapshot(doc(db, "matches", matchId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...(snap.data() as MatchDoc) } : null);
  });
}

export async function claimReferee(matchId: string, uid: string) {
  await updateDoc(doc(db, "matches", matchId), { refereeUid: uid });
}

export async function adjustScore(matchId: string, team: TeamKey, delta: number) {
  await updateDoc(doc(db, "matches", matchId), {
    [`scores.${team}`]: increment(delta),
  });
  await setDoc(doc(collection(db, "matches", matchId, "rounds")), {
    team_id: team,
    points: delta,
    createdAt: serverTimestamp(),
  });
}

export async function endMatch(matchId: string) {
  await updateDoc(doc(db, "matches", matchId), { status: "ended" });
}
