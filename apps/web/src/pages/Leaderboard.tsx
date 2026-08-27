import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLeaderboard, type LeaderboardEntry } from "@/lib/users";
import { useAuth } from "@/context/AuthContext";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    fetchLeaderboard().then(setEntries);
  }, []);

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 py-10 space-y-6">
      <header className="text-center space-y-2">
        <h1 className="font-display text-2xl">🏆 لوحة المتصدرين</h1>
        <Link to="/home" className="text-sm text-primary hover:underline">
          الرجوع للرئيسية
        </Link>
      </header>

      {!entries ? (
        <p className="text-center text-muted-foreground">جاري التحميل...</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-muted-foreground">ما فيه نتائج بعد — ابدأ العب!</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry, i) => (
            <li
              key={entry.uid}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                entry.display_name === profile?.display_name ? "bg-primary/10 border-primary" : "bg-card"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 text-center font-display text-lg">{MEDALS[i] ?? i + 1}</span>
                <span className="font-bold">{entry.display_name}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {entry.xp ?? 0} نقطة خبرة · مستوى {entry.level ?? 1}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
