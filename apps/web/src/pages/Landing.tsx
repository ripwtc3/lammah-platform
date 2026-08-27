import { Link } from "react-router-dom";

const GAMES = [
  { name: "خمّن الرقم", desc: "أقرب تخمين للرقم السري يفوز.", grad: "btn-glow-primary" },
  { name: "تسلّق الجبل", desc: "أول من يوصل القمة يفوز.", grad: "btn-glow-accent" },
  { name: "تصويت الجمهور", desc: "الأكثر أصواتاً يفوز.", grad: "btn-glow-success" },
  { name: "قفص الفراشات 🦋", desc: "هويتك مخفية حتى تُقصى.", grad: "btn-glow-live" },
];

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-5xl mx-auto w-full px-4 h-16 flex items-center justify-between">
        <span className="font-display text-xl">لمّة</span>
        <div className="flex gap-2">
          <Link to="/login" className="px-4 py-2 rounded-lg text-sm hover:bg-secondary transition-colors">دخول</Link>
          <Link to="/register" className="btn-glow btn-glow-primary px-4 py-2 rounded-lg text-sm">
            ابدأ الآن
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-20 pb-10 text-center space-y-6 fade-in-up">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-accent bg-accent/10 rounded-full px-4 py-1.5 badge-chip">
          🔴 يشتغل مباشر مع تويتش وتيك توك ويوتيوب
        </div>
        <h1 className="font-display text-4xl md:text-5xl leading-tight">
          حوّل شات بثّك إلى <span className="glow-text text-primary">لعبة جماعية</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          ألعاب قصيرة يشارك فيها جمهورك مباشرة من الشات — على البث أو بغرفة محلية مع الأصدقاء، بدون تحميل.
        </p>
        <Link
          to="/register"
          className="btn-glow btn-glow-primary inline-flex px-8 py-3 rounded-xl text-lg"
        >
          أنشئ حسابك مجاناً
        </Link>
      </main>

      <section className="max-w-4xl mx-auto px-4 py-14 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {GAMES.map((game, i) => (
          <div
            key={game.name}
            className="glass-panel p-5 flex items-center gap-4 fade-in-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={`btn-glow ${game.grad} w-11 h-11 rounded-xl shrink-0 grid place-items-center text-lg`}>
              🎮
            </div>
            <div>
              <p className="font-bold">{game.name}</p>
              <p className="text-sm text-muted-foreground">{game.desc}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
