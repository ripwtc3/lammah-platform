import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getRoom, joinRoom, subscribeParticipants, type Participant, type RoomDoc } from "@/lib/rooms";
import { startLocalAdapter, sendLocalMessage } from "@/adapters/localAdapter";
import { startTwitchAdapter } from "@/adapters/twitchAdapter";
import { startYoutubeAdapter } from "@/adapters/youtubeAdapter";
import { startTiktokAdapter } from "@/adapters/tiktokAdapter";
import { subscribeRoomState, writeRoomState, type RoomState, EMPTY_ROOM_STATE } from "@/lib/roomState";
import { subscribeHint } from "@/lib/hints";
import { runPatternGame } from "@/engine/patternEngine";
import { closestGuessPattern, CLOSEST_GUESS_ID, CLOSEST_GUESS_INSTRUCTION } from "@/patterns/closestGuess";
import { accumulationRacePattern, ACCUMULATION_RACE_ID, ACCUMULATION_RACE_INSTRUCTION } from "@/patterns/accumulationRace";
import { createAudiencePoll, AUDIENCE_POLL_ID, AUDIENCE_POLL_INSTRUCTION } from "@/patterns/audiencePoll";
import {
  startLastOneStandingGame,
  startButterflyCageGame,
  LAST_ONE_STANDING_ID,
  LAST_ONE_STANDING_INSTRUCTION,
  BUTTERFLY_CAGE_ID,
  BUTTERFLY_CAGE_INSTRUCTION,
} from "@/games/lastOneStanding/engine";
import { startVaultPulseGame, VAULT_PULSE_ID, VAULT_PULSE_INSTRUCTION } from "@/games/vaultPulse/engine";
import { startFortuneElevatorGame, FORTUNE_ELEVATOR_ID, FORTUNE_ELEVATOR_INSTRUCTION } from "@/games/fortuneElevator/engine";
import { startAutoSentinelGame, AUTO_SENTINEL_ID, AUTO_SENTINEL_INSTRUCTION } from "@/games/autoSentinel/engine";
import { startLastFogGame, LAST_FOG_ID, LAST_FOG_INSTRUCTION } from "@/games/lastFog/engine";

const STATUS_LABELS: Record<string, string> = {
  connecting: "جاري الاتصال...",
  connected: "متصل ✓",
  reconnecting: "إعادة الاتصال...",
  disconnected: "منقطع",
  live_not_found: "الحساب غير مباشر الآن",
  error: "خطأ بالاتصال",
};

const INSTRUCTIONS: Record<string, string> = {
  [CLOSEST_GUESS_ID]: CLOSEST_GUESS_INSTRUCTION,
  [ACCUMULATION_RACE_ID]: ACCUMULATION_RACE_INSTRUCTION,
  [AUDIENCE_POLL_ID]: AUDIENCE_POLL_INSTRUCTION,
  [LAST_ONE_STANDING_ID]: LAST_ONE_STANDING_INSTRUCTION,
  [BUTTERFLY_CAGE_ID]: BUTTERFLY_CAGE_INSTRUCTION,
  [VAULT_PULSE_ID]: VAULT_PULSE_INSTRUCTION,
  [FORTUNE_ELEVATOR_ID]: FORTUNE_ELEVATOR_INSTRUCTION,
  [AUTO_SENTINEL_ID]: AUTO_SENTINEL_INSTRUCTION,
  [LAST_FOG_ID]: LAST_FOG_INSTRUCTION,
};

// Games that eliminate players via the `alive` flag — used to render a
// generic "remaining / just eliminated" line without each game re-deriving it.
const ELIMINATION_GAME_IDS = new Set([LAST_ONE_STANDING_ID, BUTTERFLY_CAGE_ID, VAULT_PULSE_ID, FORTUNE_ELEVATOR_ID, LAST_FOG_ID]);
const POST_ROUND_PHASES = new Set(["ELIMINATE_RANDOM", "CHECK_REMAINING", "RESOLVING", "REVEAL_FLOOR", "REVEAL_ROUND"]);
const METER_GAME_IDS = new Set([VAULT_PULSE_ID, FORTUNE_ELEVATOR_ID, AUTO_SENTINEL_ID, LAST_FOG_ID]);

function prettyName(userKey: string): string {
  const parts = userKey.split(":");
  return parts.length > 1 ? parts[1] : userKey;
}

function useCountdown(endsAt?: number | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return secondsLeft;
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user, profile } = useAuth();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [state, setState] = useState<RoomState>(EMPTY_ROOM_STATE);
  const [message, setMessage] = useState("");
  const [stopGame, setStopGame] = useState<(() => void) | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>("connecting");
  const [myHint, setMyHint] = useState<string | null>(null);

  const isHost = room?.hostUid === user?.uid;
  const isLive = room?.mode === "live";
  const secondsLeft = useCountdown(state.endsAt);

  useEffect(() => {
    if (!roomId || !user) return;
    let cancelled = false;
    (async () => {
      const r = await getRoom(roomId);
      if (cancelled || !r) return;
      setRoom(r);
      if (r.hostUid !== user.uid) {
        await joinRoom(roomId, user.uid, profile?.display_name || "لاعب");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.uid]);

  useEffect(() => {
    if (!roomId) return;
    const unsubParticipants = subscribeParticipants(roomId, setParticipants);
    const unsubState = subscribeRoomState(roomId, setState);
    return () => {
      unsubParticipants();
      unsubState();
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !room) return;

    if (room.mode === "local") {
      return startLocalAdapter(roomId);
    }
    if (room.platform === "twitch" && room.platformConfig?.channel) {
      return startTwitchAdapter(roomId, room.platformConfig.channel, setLiveStatus);
    }
    if (room.platform === "tiktok" && room.platformConfig?.channel) {
      return startTiktokAdapter(roomId, room.platformConfig.channel, setLiveStatus);
    }
    if (room.platform === "youtube" && room.platformConfig?.videoId && room.platformConfig?.apiKey) {
      return startYoutubeAdapter(roomId, room.platformConfig.videoId, room.platformConfig.apiKey, setLiveStatus);
    }
    return undefined;
  }, [roomId, room]);

  // Only "مصعد الحظ" ever writes a hint, but subscribing unconditionally is
  // harmless (the doc simply never exists in other games) and avoids
  // resubscribing every time the game changes.
  useEffect(() => {
    if (!roomId || !user) return;
    return subscribeHint(roomId, user.uid, setMyHint);
  }, [roomId, user]);

  const players = state.players || {};
  const eliminatedNames = useMemo(() => {
    if (!ELIMINATION_GAME_IDS.has(state.gameId)) return [];
    return Object.values(players)
      .filter((p) => !p.alive)
      .map((p) => p.nickname);
  }, [players, state.gameId]);

  const scoreLabel = (uid: string) =>
    players[uid]?.nickname ?? participants.find((p) => p.userKey === uid)?.displayName ?? prettyName(uid);

  if (!roomId || !user) return null;

  const rosterOrSelf = () =>
    participants.length > 0 ? participants : [{ userKey: user.uid, displayName: profile?.display_name || "لاعب", role: "host" }];

  const startClosestGuess = () => {
    stopGame?.();
    setStopGame(() => runPatternGame(roomId, closestGuessPattern, (state.round || 0) + 1));
  };

  const startAccumulationRace = () => {
    stopGame?.();
    setStopGame(() => runPatternGame(roomId, accumulationRacePattern, (state.round || 0) + 1));
  };

  const startLastOneStanding = () => {
    stopGame?.();
    setStopGame(() => startLastOneStandingGame(roomId, rosterOrSelf()));
  };

  const startButterflyCage = () => {
    stopGame?.();
    setStopGame(() => startButterflyCageGame(roomId, rosterOrSelf()));
  };

  const startVaultPulse = () => {
    stopGame?.();
    setStopGame(() => startVaultPulseGame(roomId, rosterOrSelf()));
  };

  const startFortuneElevator = () => {
    stopGame?.();
    setStopGame(() => startFortuneElevatorGame(roomId, rosterOrSelf()));
  };

  const startAutoSentinel = () => {
    stopGame?.();
    setStopGame(() => startAutoSentinelGame(roomId, rosterOrSelf()));
  };

  const startLastFog = () => {
    stopGame?.();
    setStopGame(() => startLastFogGame(roomId, rosterOrSelf()));
  };

  const startAudiencePoll = () => {
    const raw = window.prompt("أدخل الخيارات مفصولة بفاصلة (مثال: أحمد,سارة,خالد)");
    if (!raw) return;
    const candidates = raw.split(",").map((c) => c.trim()).filter(Boolean);
    if (candidates.length < 2) {
      window.alert("أدخل خيارين على الأقل");
      return;
    }
    stopGame?.();
    setStopGame(() => runPatternGame(roomId, createAudiencePoll(candidates), (state.round || 0) + 1));
  };

  const resetToLobby = async () => {
    stopGame?.();
    setStopGame(null);
    await writeRoomState(roomId, {
      gameId: "",
      phase: "LOBBY",
      round: 0,
      players: {},
      target: null,
      winner: null,
      endsAt: null,
      meter: null,
      outcome: null,
      tally: null,
    });
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await sendLocalMessage(roomId, user.uid, profile?.display_name || "لاعب", message);
    setMessage("");
  };

  const instruction = INSTRUCTIONS[state.gameId] ?? null;
  const isCooperative = state.gameId === AUTO_SENTINEL_ID;
  const isTerminalPhase = state.phase === "WINNER" || state.phase === "FINISHED" || state.phase === "RESULT";

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="text-center space-y-1 fade-in-up">
        <p className="text-muted-foreground text-sm">كود الغرفة</p>
        <p className="font-display text-4xl tracking-widest glow-text text-primary">{room?.code ?? "..."}</p>
        {isLive ? (
          <p className="text-xs text-muted-foreground">{STATUS_LABELS[liveStatus] ?? liveStatus} — {room?.platform}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{participants.length} مشارك</p>
        )}
      </header>

      {(!state.gameId || state.phase === "LOBBY") && (
        <div className="glass-panel p-6 text-center space-y-4 fade-in-up">
          {isHost ? (
            <>
              <h2 className="font-display text-lg">اختر لعبة</h2>
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={startClosestGuess} className="btn-glow btn-glow-primary px-5 py-2.5 rounded-lg">
                  خمّن الرقم
                </button>
                <button onClick={startAccumulationRace} className="btn-glow btn-glow-accent px-5 py-2.5 rounded-lg">
                  تسلّق الجبل
                </button>
                <button onClick={startAudiencePoll} className="btn-glow btn-glow-success px-5 py-2.5 rounded-lg">
                  تصويت الجمهور
                </button>
                <button onClick={startVaultPulse} className="btn-glow btn-glow-primary px-5 py-2.5 rounded-lg">
                  نبض القبو
                </button>
                <button onClick={startAutoSentinel} className="btn-glow btn-glow-accent px-5 py-2.5 rounded-lg">
                  الحارس الآلي 🤖
                </button>
                {!isLive && (
                  <>
                    <button onClick={startLastOneStanding} className="btn-glow btn-glow-live px-5 py-2.5 rounded-lg">
                      آخر واحد
                    </button>
                    <button onClick={startButterflyCage} className="btn-glow btn-glow-live px-5 py-2.5 rounded-lg">
                      قفص الفراشات 🦋
                    </button>
                    <button onClick={startFortuneElevator} className="btn-glow btn-glow-success px-5 py-2.5 rounded-lg">
                      مصعد الحظ 🎰
                    </button>
                    <button onClick={startLastFog} className="btn-glow btn-glow-live px-5 py-2.5 rounded-lg">
                      الضباب الأخير 🌫️
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">بانتظار المضيف يختار لعبة...</p>
          )}
        </div>
      )}

      {instruction && state.phase !== "LOBBY" && (
        <div className="glass-panel p-6 text-center space-y-3 fade-in-up">
          <p className="text-xl font-bold">{instruction}</p>
          {secondsLeft > 0 && (
            <p className={`text-3xl font-display text-primary ${secondsLeft <= 5 ? "text-destructive" : ""}`}>{secondsLeft}</p>
          )}

          {METER_GAME_IDS.has(state.gameId) && typeof state.meter === "number" && (
            <p className="text-xs text-muted-foreground">📈 طاقة الجمهور: {state.meter}</p>
          )}

          {myHint && (
            <p className="text-accent font-bold bg-accent/10 rounded-lg px-3 py-2 inline-block">🎁 تلميحك الخاص: {myHint}</p>
          )}

          {state.gameId === CLOSEST_GUESS_ID && state.phase === "REVEAL" && (
            <div className="space-y-2 pt-2">
              <p className="text-muted-foreground">الرقم السري: <span className="text-foreground font-bold">{state.target}</span></p>
              {state.winner && <p className="text-accent font-bold">الفائز: {scoreLabel(state.winner)}</p>}
            </div>
          )}

          {state.gameId === AUDIENCE_POLL_ID && state.tally && (
            <div className="space-y-1 pt-2">
              {Object.entries(state.tally)
                .sort(([, a], [, b]) => b - a)
                .map(([candidate, count]) => (
                  <p key={candidate} className={candidate === state.winner ? "text-accent font-bold" : "text-muted-foreground"}>
                    {candidate}: {count} صوت
                  </p>
                ))}
            </div>
          )}

          {state.gameId === VAULT_PULSE_ID && state.phase === "RESOLVING" && (
            <p className="text-destructive font-bold">🚨 ممر الإنذار: {state.target}</p>
          )}

          {state.gameId === FORTUNE_ELEVATOR_ID && state.phase === "REVEAL_FLOOR" && (
            <p className="text-accent font-bold">الباب الآمن كان: {state.target}</p>
          )}

          {state.gameId === AUTO_SENTINEL_ID && (
            <div className="space-y-2 pt-2">
              <p className="text-muted-foreground">🛡️ صحة الدرع: <span className="text-foreground font-bold">{state.target}</span></p>
              {state.phase === "HIT" && <p className="text-accent font-bold">🎯 إصابة!</p>}
              {state.phase === "MISS" && <p className="text-destructive font-bold">🛡️ صدّه الحارس!</p>}
              {state.tally && (
                <div className="flex justify-center gap-3 text-xs text-muted-foreground">
                  {Object.entries(state.tally)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([port, count]) => (
                      <span key={port}>منفذ {port}: {count}</span>
                    ))}
                </div>
              )}
              {state.phase === "FINISHED" && (
                <p className={`font-bold text-lg ${state.outcome === "victory" ? "text-accent" : "text-destructive"}`}>
                  {state.outcome === "victory" ? "🎉 انتصر الجمهور على الحارس!" : "💥 صمد الحارس الآلي — حاولوا مرة ثانية"}
                </p>
              )}
            </div>
          )}

          {state.gameId === LAST_FOG_ID && state.target && !isTerminalPhase && (
            <p className="text-muted-foreground">🔦 الصياد هذي الجولة: <span className="text-foreground font-bold">{scoreLabel(String(state.target))}</span></p>
          )}

          {POST_ROUND_PHASES.has(state.phase) && ELIMINATION_GAME_IDS.has(state.gameId) && (
            <p className="text-muted-foreground">
              متبقي {Object.values(players).filter((p) => p.alive).length} — أُقصي: {eliminatedNames[eliminatedNames.length - 1] ?? "—"}
            </p>
          )}

          {isTerminalPhase && !isCooperative && (
            <p className="text-accent font-bold text-lg pulse-ring inline-block rounded-full px-4 py-1">
              🏆 الفائز: {scoreLabel(state.winner || "")}
            </p>
          )}

          {isHost && isTerminalPhase && (
            <button onClick={resetToLobby} className="btn-glow btn-glow-primary px-5 py-2 rounded-lg">
              لعبة جديدة
            </button>
          )}
        </div>
      )}

      {!isLive && (
        <form onSubmit={sendChat} className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="اكتب رسالتك هنا..."
            className="flex-1 h-11 rounded-lg bg-card border px-3 outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          <button type="submit" className="btn-glow btn-glow-primary px-5 h-11 rounded-lg">
            إرسال
          </button>
        </form>
      )}
      {isLive && (
        <p className="text-center text-sm text-muted-foreground">
          الجمهور يشارك من شات {room?.platform} مباشرة — لا حاجة لكتابة شي هنا
        </p>
      )}

      <div className="text-center text-xs text-muted-foreground">
        {Object.keys(players).length > 0 && (
          <p>
            النقاط:{" "}
            {Object.values(players)
              .map((p) => `${p.nickname}: ${p.score}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
