import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav("/home");
    } catch {
      setError("فشل تسجيل الدخول — تأكد من البريد وكلمة المرور");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm glass-panel p-8 space-y-6 fade-in-up">
        <h1 className="font-display text-2xl text-center">أهلاً بعودتك</h1>
        {error && <p className="text-destructive text-sm text-center">{error}</p>}
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-11 rounded-lg bg-background/60 border px-3 outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-11 rounded-lg bg-background/60 border px-3 outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          <button type="submit" disabled={busy} className="btn-glow btn-glow-primary w-full h-11 rounded-lg">
            {busy ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
        <button
          onClick={() => loginWithGoogle().then(() => nav("/home"))}
          className="w-full h-11 rounded-lg bg-secondary hover:bg-secondary/70 transition-colors font-bold"
        >
          الدخول بحساب Google
        </button>
        <p className="text-center text-sm text-muted-foreground">
          ما عندك حساب؟ <Link to="/register" className="text-primary font-bold hover:underline">أنشئ واحد</Link>
        </p>
      </div>
    </div>
  );
}
