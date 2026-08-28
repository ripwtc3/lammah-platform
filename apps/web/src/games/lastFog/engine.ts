import { eventBus } from "@/engine/EventBus";
import { writeRoomState } from "@/lib/roomState";
import { incrementXp } from "@/lib/users";
import type { PlayerState } from "@/engine/GameState";

/**
 * "الضباب الأخير" — asymmetric hide-and-seek. One random participant is the
 * hunter each round (rotates every round); everyone else hides in a zone.
 * Non-hunter players can also crowd-suggest a search zone ("مسح <رقم>"),
 * which fills in for an inactive hunter or adds extra search slots. The
 * cumulative like-meter grants the hunter MORE simultaneous search zones
 * over time — a deliberate tension where audience engagement makes life
 * harder for the ghosts, not easier.
 */
export const LAST_FOG_ID = "lastFog";
export const LAST_FOG_INSTRUCTION = "الأشباح: اكتبوا رقم منطقة (1-5) للاختباء — الصياد: اكتب رقم المنطقة اللي تفتّشها";

const ZONES = 5;
const ROUND_MS = 9_000;
const BETWEEN_ROUNDS_MS = 2_500;
const MAX_ROUNDS = 10;
const LIKE_STEP = 25;
const HUNTER_XP_REWARD = 25;
const SURVIVOR_XP_REWARD = 10;

interface Participant {
  userKey: string;
  displayName: string;
}

export function startLastFogGame(roomId: string, participants: Participant[]) {
  const players: Record<string, PlayerState> = {};
  for (const p of participants) players[p.userKey] = { nickname: p.displayName, score: 0, alive: true, value: null };

  let round = 0;
  let meter = 0;
  let stopped = false;
  let currentHunter: string | null = null;
  let activeUnsubscribe: (() => void) | null = null;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;

  const aliveKeys = () => Object.entries(players).filter(([, p]) => p.alive).map(([key]) => key);

  function pickHunter(alive: string[]): string {
    const candidates = alive.filter((key) => key !== currentHunter);
    const pool = candidates.length > 0 ? candidates : alive;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function guessSlots(): number {
    return Math.min(ZONES - 1, 1 + Math.floor(meter / LIKE_STEP));
  }

  async function finish(winnerKey: string | null, bonusSurvivors: string[] = []) {
    await writeRoomState(roomId, { gameId: LAST_FOG_ID, phase: "WINNER", round, players: { ...players }, winner: winnerKey, meter, endsAt: null });
    if (winnerKey) await incrementXp(winnerKey, HUNTER_XP_REWARD);
    for (const uid of bonusSurvivors) await incrementXp(uid, SURVIVOR_XP_REWARD);
  }

  async function playRound() {
    if (stopped) return;
    round += 1;

    const alive = aliveKeys();
    const ghostsAlive = alive.filter((key) => key !== currentHunter);

    if (currentHunter && ghostsAlive.length === 0) {
      await finish(currentHunter);
      return;
    }
    if (alive.length <= 1) {
      await finish(alive[0] ?? null);
      return;
    }
    if (round > MAX_ROUNDS) {
      const survivors = alive.filter((key) => key !== currentHunter);
      await finish(survivors[0] ?? alive[0] ?? null, survivors.slice(1));
      return;
    }

    currentHunter = pickHunter(alive);
    for (const key of alive) players[key] = { ...players[key], value: null };

    const suggestions = new Map<number, number>();
    const hunterKey = currentHunter;
    const endsAt = Date.now() + ROUND_MS;
    await writeRoomState(roomId, {
      gameId: LAST_FOG_ID,
      phase: "HIDING",
      round,
      players: { ...players },
      target: hunterKey,
      endsAt,
      winner: null,
      meter,
    });

    activeUnsubscribe = eventBus.subscribeRoom(roomId, (event) => {
      if (event.kind === "gift") {
        const candidates = aliveKeys().filter((key) => key !== hunterKey);
        if (candidates.length > 0) {
          const lucky = candidates[Math.floor(Math.random() * candidates.length)];
          players[lucky] = { ...players[lucky], value: "immune" };
        }
        return;
      }
      if (event.kind === "like") {
        meter += 1;
        return;
      }
      if (event.kind === "follow") {
        const caught = Object.entries(players).find(([, p]) => !p.alive);
        if (caught) {
          const [uid, p] = caught;
          players[uid] = { ...p, alive: true, value: null };
        }
        return;
      }
      if (event.kind !== "comment") return;

      const text = event.text.trim();
      const scanMatch = text.match(/^مسح\s*(\d+)$/);
      if (scanMatch && event.userKey !== hunterKey) {
        const zone = Number.parseInt(scanMatch[1], 10);
        if (zone >= 1 && zone <= ZONES) suggestions.set(zone, (suggestions.get(zone) ?? 0) + 1);
        return;
      }

      const zone = Number.parseInt(text, 10);
      if (!Number.isFinite(zone) || zone < 1 || zone > ZONES) return;
      const p = players[event.userKey];
      if (!p || !p.alive) return;

      if (event.userKey === hunterKey) {
        players[event.userKey] = { ...p, value: `hunt:${zone}` };
      } else if (p.value !== "immune") {
        players[event.userKey] = { ...p, value: zone };
      }
    });

    activeTimer = setTimeout(async () => {
      activeUnsubscribe?.();
      activeUnsubscribe = null;
      if (stopped || !hunterKey) return;

      const hunterEntry = players[hunterKey];
      let hunterZones: number[] = [];
      if (typeof hunterEntry?.value === "string" && hunterEntry.value.startsWith("hunt:")) {
        hunterZones = [Number.parseInt(hunterEntry.value.slice(5), 10)];
      }

      const slots = guessSlots();
      const sortedSuggestions = [...suggestions.entries()].sort((a, b) => b[1] - a[1]).map(([zone]) => zone);
      for (const zone of sortedSuggestions) {
        if (hunterZones.length >= slots) break;
        if (!hunterZones.includes(zone)) hunterZones.push(zone);
      }
      if (hunterZones.length === 0 && sortedSuggestions.length > 0) hunterZones = [sortedSuggestions[0]];

      let caughtAny = false;
      for (const key of aliveKeys()) {
        if (key === hunterKey) continue;
        const p = players[key];
        if (typeof p.value === "number" && hunterZones.includes(p.value)) {
          players[key] = { ...p, alive: false };
          caughtAny = true;
        } else if (p.value === "immune") {
          players[key] = { ...p, value: null };
        }
      }
      if (caughtAny && players[hunterKey]) {
        players[hunterKey] = { ...players[hunterKey], score: players[hunterKey].score + 1 };
      }

      await writeRoomState(roomId, { phase: "REVEAL_ROUND", round, players: { ...players }, target: hunterKey, meter });
      activeTimer = setTimeout(playRound, BETWEEN_ROUNDS_MS);
    }, ROUND_MS);
  }

  playRound();

  return function stop() {
    stopped = true;
    activeUnsubscribe?.();
    if (activeTimer) clearTimeout(activeTimer);
  };
}
