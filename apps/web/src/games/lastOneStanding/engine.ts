import { eventBus } from "@/engine/EventBus";
import { writeRoomState } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";
import type { PlayerState } from "@/engine/GameState";

/**
 * Pattern 5 — Random Elimination, with a `masked` config flag instead of a
 * second implementation (per the group-elimination-draw blueprint's own
 * lesson: two variants of one mechanic should be one config-driven engine,
 * not a code fork). Both variants keep their own multi-round orchestration
 * rather than using runPatternGame(), since elimination spans many rounds.
 *
 * Masking is done properly, not just visually: in masked mode the Firestore
 * `players` map is keyed by an unlinkable mask id ("butterfly-3"), and the
 * real uid/name is kept ONLY in this function's local closure — never
 * written anywhere readable — until the exact moment that player is
 * eliminated, when their entry's nickname is swapped to the real name.
 */
export const LAST_ONE_STANDING_ID = "lastOneStanding";
export const LAST_ONE_STANDING_INSTRUCTION = "اكتب كلمة 'أنا' للبقاء";
export const BUTTERFLY_CAGE_ID = "butterflyCage";
export const BUTTERFLY_CAGE_INSTRUCTION = "اكتب كلمة 'أنا' للبقاء — هويتك مخفية حتى تُقصى";

const ROUND_OPEN_MS = 10_000;
const BETWEEN_ROUNDS_MS = 3_000;
const SURVIVE_WORD = "أنا";
const XP_REWARD = 20;

interface Participant {
  userKey: string;
  displayName: string;
}

function startEliminationDraw(roomId: string, participants: Participant[], masked: boolean) {
  const gameId = masked ? BUTTERFLY_CAGE_ID : LAST_ONE_STANDING_ID;

  // stateKey -> real userKey (kept only in memory, never written to Firestore).
  const realKeyOf = new Map<string, string>();
  const players: Record<string, PlayerState> = {};

  const roster = masked ? [...participants].sort(() => Math.random() - 0.5) : participants;
  roster.forEach((p, i) => {
    const stateKey = masked ? `butterfly-${i + 1}` : p.userKey;
    realKeyOf.set(stateKey, p.userKey);
    players[stateKey] = { nickname: masked ? `فراشة #${i + 1}` : p.displayName, score: 0, alive: true };
  });

  // Reverse lookup so incoming chat events (always keyed by the real userKey) resolve to a stateKey.
  const stateKeyOfUser = new Map<string, string>();
  for (const [stateKey, realKey] of realKeyOf) stateKeyOfUser.set(realKey, stateKey);

  let round = 0;
  let stopped = false;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  const aliveStateKeys = () => Object.entries(players).filter(([, p]) => p.alive).map(([key]) => key);

  async function playRound() {
    if (stopped) return;
    round += 1;
    const alive = aliveStateKeys();

    if (alive.length <= 1) {
      const winnerKey = alive[0] ?? null;
      const realWinner = winnerKey ? realKeyOf.get(winnerKey) : null;
      // Winning is a reveal moment too — a masked champion staying anonymous
      // forever defeats the point of the "who was it?!" payoff.
      const winnerRealName = participants.find((p) => p.userKey === realWinner)?.displayName;
      if (winnerKey) {
        players[winnerKey] = {
          ...players[winnerKey],
          score: players[winnerKey].score + 1,
          nickname: masked && winnerRealName ? winnerRealName : players[winnerKey].nickname,
        };
      }
      await writeRoomState(roomId, { gameId, phase: "WINNER", round, players: { ...players }, winner: winnerKey });
      if (realWinner) await incrementXp(realWinner, XP_REWARD);
      return;
    }

    const endsAt = Date.now() + ROUND_OPEN_MS;
    const repliers = new Set<string>(); // stateKeys

    await writeRoomState(roomId, { gameId, phase: "ROUND_OPEN", round, players: { ...players }, endsAt, winner: null });

    activeUnsubscribe = eventBus.subscribeRoom(roomId, (event) => {
      if (event.text.trim() !== SURVIVE_WORD) return;
      const stateKey = stateKeyOfUser.get(event.userKey);
      if (stateKey) repliers.add(stateKey);
    });

    activeTimer = setTimeout(async () => {
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      if (stopped) return;

      const currentAlive = aliveStateKeys();
      const nonRepliers = currentAlive.filter((key) => !repliers.has(key));
      const pool = nonRepliers.length > 0 ? nonRepliers : currentAlive;
      const eliminated = pool[Math.floor(Math.random() * pool.length)];

      // The reveal moment: swap the mask label for the real name right as
      // they're eliminated — never before, and only for this one entry.
      const realName = participants.find((p) => p.userKey === realKeyOf.get(eliminated))?.displayName;
      players[eliminated] = {
        ...players[eliminated],
        alive: false,
        nickname: masked && realName ? realName : players[eliminated].nickname,
      };

      await writeRoomState(roomId, { phase: "ELIMINATE_RANDOM", round, players: { ...players } });

      activeTimer = setTimeout(playRound, BETWEEN_ROUNDS_MS);
    }, ROUND_OPEN_MS);
  }

  playRound();

  return function stop() {
    stopped = true;
    activeUnsubscribe?.();
    if (activeTimer) clearTimeout(activeTimer);
  };
}

export function startLastOneStandingGame(roomId: string, participants: Participant[]) {
  return startEliminationDraw(roomId, participants, false);
}

export function startButterflyCageGame(roomId: string, participants: Participant[]) {
  return startEliminationDraw(roomId, participants, true);
}
