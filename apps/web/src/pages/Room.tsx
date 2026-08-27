import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getRoom, joinRoom, subscribeParticipants, type Participant, type RoomDoc } from "@/lib/rooms";
import { startLocalAdapter, sendLocalMessage } from "@/adapters/localAdapter";
import { startTwitchAdapter } from "@/adapters/twitchAdapter";
import { startYoutubeAdapter } from "@/adapters/youtubeAdapter";
import { startTiktokAdapter } from "@/adapters/tiktokAdapter";
import { subscribeRoomState, writeRoomState, type RoomState, EMPTY_ROOM_STATE } from "@/lib/roomState";
import { startGuessNumberRound, GUESS_NUMBER_ID, GUESS_NUMBER_INSTRUCTION } from "@/games/guessNumber/engine";
import { startLastOneStandingGame, LAST_ONE_STANDING_ID, LAST_ONE_STANDING_INSTRUCTION } from "@/games/lastOneStanding/engine";

const STATUS_LABELS: Record<string, string> = {
  connecting: "جاري الاتصال...",
  connected: "متصل ✓",
  reconnecting: "إعادة الاتصال...",
  disconnected: "منقطع",
  live_not_found: "الحساب غير مباشر الآن",
  error: "خطأ بالاتصال",
};

function prettyName(userKey: string): string {
  const parts = userKey.split(":");
  return parts.length > 1 ? parts[1] : userKey;
}

function useCountdown(endsAt?: number) {
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

  // Load the room doc once and join as a participant if this user isn't the host.
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

  // Participants + shared game state are always live regardless of source.
  useEffect(() => {
    if (!roomId) return;
    const unsubParticipants = subscribeParticipants(roomId, setParticipants);
    const unsubState = subscribeRoomState(roomId, setState);
    return () => {
      unsubParticipants();
      unsubState();
    };
  }, [roomId]);

  // Once we know the room's mode/platform, wire the matching chat source into the EventBus.
  useEffect(() => {
    if (!roomId || !room) return;

    if (room.mode === "local") {
      const unsub = startLocalAdapter(roomId);
      return unsub;
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

  const eliminatedNames = useMemo(() => {
    if (state.gameId !== LAST_ONE_STANDING_ID) return [];
    const remainingSet = new Set(state.remaining);
    return participants.filter((p) => !remainingSet.has(p.userKey)).map((p) => p.displayName);
  }, [participants, state]);

  const scoreLabel = (uid: string) => participants.find((p) => p.userKey === uid)?.displayName ?? prettyName(uid);

  if (!roomId || !user) return null;

  const startGuessNumber = () => {
    stopGame?.();
    const stop = startGuessNumberRound(roomId, (state.round || 0) + 1);
    setStopGame(() => stop);
  };

  const startLastOneStanding = () => {
    stopGame?.();
    const roster = participants.length > 0 ? participants : [{ userKey: user.uid, displayName: profile?.display_name || "لاعب", role: "host" }];
    const stop = startLastOneStandingGame(roomId, roster);
    setStopGame(() => stop);
  };

  const resetToLobby = async () => {
    stopGame?.();
    setStopGame(null);
    await writeRoomState(roomId, { gameId: "", phase: "LOBBY", round: 0, votes: {}, remaining: [], winner: null });
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await sendLocalMessage(roomId, user.uid, profile?.display_name || "لاعب", message);
    setMessage("");
  };

  const instruction =
    state.gameId === GUESS_NUMBER_ID
      ? GUESS_NUMBER_INSTRUCTION
      : state.gameId === LAST_ONE_STANDING_ID
        ? LAST_ONE_STANDING_INSTRUCTION
        : null;

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="text-center space-y-1">
        <p className="text-muted-foreground text-sm">كود الغرفة</p>
        <p className="font-display text-4xl tracking-widest">{room?.code ?? "..."}</p>
        {isLive ? (
          <p className="text-xs text-muted-foreground">{STATUS_LABELS[liveStatus] ?? liveStatus} — {room?.platform}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{participants.length} مشارك</p>
        )}
      </header>

      {(!state.gameId || state.phase === "LOBBY") && (
        <div className="rounded-2xl bg-card border p-6 text-center space-y-4">
          {isHost ? (
            <>
              <h2 className="font-display text-lg">اختر لعبة</h2>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={startGuessNumber} className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold">
                  خمّن الرقم
                </button>
                {!isLive && (
                  <button onClick={startLastOneStanding} className="px-5 py-2.5 rounded-lg bg-secondary font-bold">
                    آخر واحد
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">بانتظار المضيف يختار لعبة...</p>
          )}
        </div>
      )}

      {instruction && state.phase !== "LOBBY" && (
        <div className="rounded-2xl bg-card border p-6 text-center space-y-3">
          <p className="text-xl font-bold">{instruction}</p>
          {secondsLeft > 0 && <p className="text-3xl font-display text-primary">{secondsLeft}</p>}

          {state.phase === "REVEAL" && (
            <div className="space-y-2 pt-2">
              <p className="text-muted-foreground">الرقم السري: <span className="text-foreground font-bold">{state.secretNumber}</span></p>
              {state.winner && (
                <p className="text-accent font-bold">
                  الفائز: {(state.votes[state.winner] as { displayName?: string })?.displayName ?? prettyName(state.winner)}
                </p>
              )}
            </div>
          )}

          {(state.phase === "ELIMINATE_RANDOM" || state.phase === "CHECK_REMAINING") && (
            <p className="text-muted-foreground">متبقي {state.remaining.length} — أُقصي: {eliminatedNames[eliminatedNames.length - 1] ?? "—"}</p>
          )}

          {state.phase === "WINNER" && (
            <p className="text-accent font-bold text-lg">
              🏆 الفائز: {scoreLabel(state.winner || "")}
            </p>
          )}

          {isHost && state.phase === "WINNER" && (
            <button onClick={resetToLobby} className="px-5 py-2 rounded-lg bg-secondary font-bold">
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
            className="flex-1 h-11 rounded-lg bg-card border px-3 outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" className="px-5 h-11 rounded-lg bg-primary text-primary-foreground font-bold">
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
        {Object.keys(state.scores || {}).length > 0 && (
          <p>
            النقاط:{" "}
            {Object.entries(state.scores)
              .map(([uid, score]) => `${scoreLabel(uid)}: ${score}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
