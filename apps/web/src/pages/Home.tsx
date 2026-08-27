import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { createRoom, findRoomByCode, joinRoom, type LivePlatform } from "@/lib/rooms";
import { createMatch } from "@/lib/matches";

const PLATFORMS: { id: LivePlatform; label: string }[] = [
  { id: "twitch", label: "تويتش" },
  { id: "youtube", label: "يوتيوب" },
  { id: "tiktok", label: "تيك توك" },
];

export default function Home() {
  const { user, profile, logout } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [platform, setPlatform] = useState<LivePlatform>("twitch");
  const [channel, setChannel] = useState("");
  const [videoId, setVideoId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchName, setMatchName] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const nav = useNavigate();

  if (!user) return null;

  const onCreateLocal = async () => {
    setBusy(true);
    try {
      const roomId = await createRoom(user.uid, profile?.display_name || "المضيف");
      nav(`/room/${roomId}`);
    } finally {
      setBusy(false);
    }
  };

  const onCreateLive = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const config = platform === "youtube" ? { videoId, apiKey } : { channel };
      const roomId = await createRoom(user.uid, profile?.display_name || "المضيف", { platform, config });
      nav(`/room/${roomId}`);
    } finally {
      setBusy(false);
    }
  };

  const onCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const matchId = await createMatch(user.uid, matchName, teamA, teamB);
      nav(`/match/${matchId}`);
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const roomId = await findRoomByCode(joinCode);
      if (!roomId) {
        setError("ما لقينا غرفة بهذا الكود");
        return;
      }
      await joinRoom(roomId, user.uid, profile?.display_name || "لاعب");
      nav(`/room/${roomId}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
        <span className="font-display text-xl">لمّة</span>
        <div className="flex items-center gap-4">
          <Link to="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground">المتصدرين</Link>
          <Link to="/how-to-play" className="text-sm text-muted-foreground hover:text-foreground">كيف ألعب</Link>
          <span className="text-sm text-muted-foreground">{profile?.display_name}</span>
          <button onClick={() => logout()} className="text-sm text-muted-foreground hover:text-foreground">خروج</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="rounded-2xl bg-card border p-6 text-center space-y-4">
          <h2 className="font-display text-xl">أنشئ غرفة محلية</h2>
          <p className="text-sm text-muted-foreground">شارك الكود مع أصحابك وابدأوا اللعب من نفس الغرفة</p>
          <button onClick={onCreateLocal} disabled={busy} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold">
            إنشاء غرفة محلية
          </button>
        </div>

        <div className="rounded-2xl bg-card border p-6 space-y-4">
          <button onClick={() => setLiveOpen((v) => !v)} className="w-full font-display text-xl text-center">
            🔴 غرفة بث مباشر {liveOpen ? "▲" : "▼"}
          </button>
          {liveOpen && (
            <form onSubmit={onCreateLive} className="space-y-3">
              <div className="flex gap-2 justify-center">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold ${platform === p.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {platform === "youtube" ? (
                <>
                  <input
                    value={videoId}
                    onChange={(e) => setVideoId(e.target.value)}
                    placeholder="معرّف فيديو البث المباشر (Video ID)"
                    required
                    className="w-full h-11 rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="مفتاح YouTube Data API الخاص بك"
                    required
                    className="w-full h-11 rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
                  />
                </>
              ) : (
                <input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder={platform === "twitch" ? "اسم قناة تويتش" : "يوزرنيم تيك توك"}
                  required
                  className="w-full h-11 rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
                />
              )}

              <button type="submit" disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-bold">
                ربط والبدء
              </button>
            </form>
          )}
        </div>

        <div className="rounded-2xl bg-card border p-6 space-y-4">
          <button onClick={() => setMatchOpen((v) => !v)} className="w-full font-display text-xl text-center">
            🏆 مباراة رسمية {matchOpen ? "▲" : "▼"}
          </button>
          {matchOpen && (
            <form onSubmit={onCreateMatch} className="space-y-3">
              <input
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                placeholder="اسم المباراة"
                required
                className="w-full h-11 rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={teamA}
                  onChange={(e) => setTeamA(e.target.value)}
                  placeholder="اسم الفريق الأول"
                  required
                  className="h-11 rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  value={teamB}
                  onChange={(e) => setTeamB(e.target.value)}
                  placeholder="اسم الفريق الثاني"
                  required
                  className="h-11 rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button type="submit" disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-bold">
                إنشاء المباراة
              </button>
            </form>
          )}
        </div>

        <div className="rounded-2xl bg-card border p-6 space-y-4">
          <h2 className="font-display text-xl text-center">انضم بكود</h2>
          {error && <p className="text-destructive text-sm text-center">{error}</p>}
          <form onSubmit={onJoin} className="flex gap-2 justify-center">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={5}
              className="w-32 h-11 text-center tracking-widest rounded-lg bg-background border px-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" disabled={busy || joinCode.length < 5} className="px-5 h-11 rounded-lg bg-secondary font-bold">
              انضمام
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
