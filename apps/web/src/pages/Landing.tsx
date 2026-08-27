import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-5xl mx-auto w-full px-4 h-16 flex items-center justify-between">
        <span className="font-display text-xl">لمّة</span>
        <div className="flex gap-2">
          <Link to="/login" className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">دخول</Link>
          <Link to="/register" className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-bold">
            ابدأ الآن
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-20 text-center space-y-6">
        <h1 className="font-display text-4xl md:text-5xl leading-tight">
          حوّل شات بثّك إلى لعبة جماعية
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          ألعاب قصيرة يشارك فيها جمهورك مباشرة من الشات — على البث أو بغرفة محلية مع الأصدقاء، بدون تحميل.
        </p>
        <Link
          to="/register"
          className="inline-block px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-lg"
        >
          أنشئ حسابك
        </Link>
      </main>
    </div>
  );
}
