import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/context/AuthContext";
import { subscribeMatch, claimReferee, adjustScore, endMatch, type MatchDoc, type TeamKey } from "@/lib/matches";

const TEAM_KEYS: TeamKey[] = ["teamA", "teamB"];

export default function Match() {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [match, setMatch] = useState<(MatchDoc & { id: string }) | null>(null);
  const [claiming, setClaiming] = useState(false);

  const roleParam = searchParams.get("role");
  const tokenParam = searchParams.get("token");

  useEffect(() => {
    if (!matchId) return;
    return subscribeMatch(matchId, setMatch);
  }, [matchId]);

  useEffect(() => {
    if (!match || !user || roleParam !== "referee") return;
    if (match.refereeUid || tokenParam !== match.refereeToken) return;
    setClaiming(true);
    claimReferee(match.id, user.uid).finally(() => setClaiming(false));
  }, [match, user, roleParam, tokenParam]);

  if (!match) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">جاري التحميل...</div>;
  }

  const isHost = user?.uid === match.hostUid;
  const isReferee = user?.uid === match.refereeUid;
  const canControl = (isHost || isReferee) && match.status === "active";

  const refereeLink = `${window.location.origin}/match/${match.id}?role=referee&token=${match.refereeToken}`;
  const spectatorLink = `${window.location.origin}/match/${match.id}`;
  const winner =
    match.scores.teamA === match.scores.teamB ? null : match.scores.teamA > match.scores.teamB ? match.teams[0] : match.teams[1];

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-10 space-y-8 text-center">
      <h1 className="font-display text-2xl">{match.name}</h1>

      <div className="grid grid-cols-2 gap-6">
        {TEAM_KEYS.map((key, i) => (
          <div key={key} className="glass-panel p-6 space-y-3 fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
            <p className="font-bold text-lg">{match.teams[i]}</p>
            <p className="font-display text-5xl glow-text text-primary">{match.scores[key]}</p>
            {canControl && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => adjustScore(match.id, key, 1)}
                  className="btn-glow btn-glow-success w-9 h-9 rounded-lg"
                >
                  +
                </button>
                <button
                  onClick={() => adjustScore(match.id, key, -1)}
                  className="w-9 h-9 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors font-bold"
                >
                  −
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isHost && match.status === "active" && (
        <div className="grid grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">رابط الحكم</p>
            <div className="bg-white p-3 rounded-xl inline-block shadow-lg">
              <QRCodeSVG value={refereeLink} size={128} />
            </div>
            <p className="text-xs break-all text-muted-foreground">{refereeLink}</p>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">رابط المشاهدين</p>
            <div className="bg-white p-3 rounded-xl inline-block">
              <QRCodeSVG value={spectatorLink} size={128} />
            </div>
            <p className="text-xs break-all text-muted-foreground">{spectatorLink}</p>
          </div>
        </div>
      )}

      {roleParam === "referee" && !isReferee && match.refereeUid && (
        <p className="text-destructive">تم تعيين حكم آخر لهذه المباراة مسبقاً</p>
      )}
      {claiming && <p className="text-muted-foreground">جاري تعيينك كحكم...</p>}
      {isReferee && <p className="text-accent font-bold">أنت الحكم في هذه المباراة</p>}

      {isHost && match.status === "active" && (
        <button onClick={() => endMatch(match.id)} className="btn-glow px-6 py-2 rounded-lg" style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}>
          إنهاء المباراة
        </button>
      )}
      {match.status === "ended" && (
        <p className="font-display text-xl text-accent pulse-ring inline-block rounded-full px-4 py-1">
          🏆 انتهت المباراة — {winner ? `الفائز: ${winner}` : "تعادل"}
        </p>
      )}
    </div>
  );
}
