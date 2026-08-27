import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getRoom, joinRoom, subscribeParticipants, type Participant, type RoomDoc } from "@/lib/rooms";
import { startLocalAdapter, sendLocalMessage } from "@/adapters/localAdapter";
import { startTwitchAdapter } from "@/adapters/twitchAdapter";
import { startYoutubeAdapter } from "@/adapters/youtubeAdapter";
import { startTiktokAdapter } from "@/adapters/tiktokAdapter";
import { subscribeRoomState, writeRoomState, type RoomState, EMPTY_ROOM_STATE } from "@/lib/roomState";
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
};

const ELIMINATION_GAME_IDS = new Set([LAST_ONE_STANDING_ID, BUTTERFLY_CAGE_ID]);

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

  const startClosestGuess = () => {
    stopGame?.();
    setStopGame(() => runPatternGame(roomId, closestGuessPattern, (state.round || 0) + 1));
  };

  const startAccumulationRace = () => {
    stopGame?.();
    setStopGame(() => runPatternGame(roomId, accumulationRacePattern, (state.round || 0) + 1));
  };

  const rosterOrSelf = () =>
    participants.length > 0 ? participants : [{ userKey: user.uid, displayName: profile?.display_name || "لاعب", role: "host" }];

  const startLastOneStanding = () => {
    stopGame?.();
    setStopGame(() => startLastOneStandingGame(roomId, rosterOrSelf()));
  };

  const startButterflyCage = () => {
    stopGame?.();
    setStopGame(() => startButterflyCageGame(roomId, rosterOrSelf()));
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
    await writeRoomState(roomId, { gameId: "", phase: "LOBBY", round: 0, players: {}, target: null, winner: null, endsAt: null });
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await sendLocalMessage(roomId, user.uid, profile?.display_name || "لاعب", message);
    setMessage("");
  };

  const instruction = INSTRUCTIONS[state.gameId] ?? null;
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
                {!isLive && (
                  <>
                    <button onClick={startLastOneStanding} className="btn-glow btn-glow-live px-5 py-2.5 rounded-lg">
                      آخر واحد
                    </button>
                    <button onClick={startButterflyCage} className="btn-glow btn-glow-live px-5 py-2.5 rounded-lg">
                      قفص الفراشات 🦋
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

          {state.phase === "REVEAL" && (
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

          {(state.phase === "ELIMINATE_RANDOM" || state.phase === "CHECK_REMAINING") && (
            <p className="text-muted-foreground">
              متبقي {Object.values(players).filter((p) => p.alive).length} — أُقصي: {eliminatedNames[eliminatedNames.length - 1] ?? "—"}
            </p>
          )}

          {isTerminalPhase && (
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
