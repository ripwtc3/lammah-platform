import { Link } from "react-router-dom";

const STEPS = [
  { title: "أنشئ غرفة", body: "غرفة محلية للعب مع أصحابك من نفس الجهاز/أجهزة متعددة، أو غرفة بث مباشر تربط شات تويتش/تيك توك/يوتيوب." },
  { title: "شارك الكود أو الرابط", body: "بالغرفة المحلية شارك كود الغرفة (5 أحرف). بالبث، جمهورك يتفاعل من شات المنصة نفسها مباشرة." },
  { title: "اختر لعبة وابدأ", body: "كل لعبة لها تعليمة واحدة بسيطة يفهمها أي شخص من أول رسالة — اكتبها بالشات وشارك." },
];

const GAMES = [
  { name: "خمّن الرقم", desc: "الجميع يخمّن رقم من 1 إلى 100 خلال 30 ثانية — أقرب تخمين للرقم السري يفوز." },
  { name: "تسلّق الجبل", desc: "اكتب 'قمة' في الشات لتصعد درجة — أول من يوصل القمة يفوز، أو الأعلى تسلّقاً عند انتهاء الوقت." },
  { name: "تصويت الجمهور", desc: "المضيف يحدد خيارات (أسماء متسابقين مثلاً)، والجمهور يصوّت بكتابة الاسم بالضبط — الأكثر أصواتاً يفوز." },
  { name: "آخر واحد", desc: "كل جولة اكتب 'أنا' للبقاء — من ما يكتب يُقصى عشوائياً، حتى يتبقى فائز واحد." },
  { name: "قفص الفراشات 🦋", desc: "نفس فكرة 'آخر واحد' لكن بهويات مخفية بالكامل (فراشة #1، #2...) — تنكشف هوية كل شخص فقط لحظة إقصائه." },
];

export default function HowToPlay() {
  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-10 space-y-10">
      <header className="text-center space-y-2">
        <h1 className="font-display text-2xl">كيف ألعب؟</h1>
        <Link to="/home" className="text-sm text-primary hover:underline">الرجوع للرئيسية</Link>
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-lg">ثلاث خطوات</h2>
        {STEPS.map((step, i) => (
          <div key={step.title} className="glass-panel flex gap-4 items-start p-4 fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="font-display text-2xl glow-text text-primary">{i + 1}</span>
            <div>
              <p className="font-bold">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg">الألعاب المتاحة</h2>
        {GAMES.map((game, i) => (
          <div key={game.name} className="glass-panel p-4 fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <p className="font-bold">{game.name}</p>
            <p className="text-sm text-muted-foreground">{game.desc}</p>
          </div>
        ))}
      </section>

      <section className="glass-panel p-4 space-y-2">
        <h2 className="font-display text-lg">مباراة رسمية</h2>
        <p className="text-sm text-muted-foreground">
          أنشئ مباراة بين فريقين واحصل على رابط/رمز QR خاص بالحكم لتحكيم النتيجة، ورابط منفصل للمشاهدين لمتابعة النتيجة لحظياً.
        </p>
      </section>
    </div>
  );
}
