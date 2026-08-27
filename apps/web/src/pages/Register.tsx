import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Register() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("كلمة المرور 8 أحرف على الأقل");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName);
      nav("/home");
    } catch {
      setError("تعذر إنشاء الحساب — جرّب بريداً آخر");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="font-display text-2xl text-center">أنشئ حسابك</h1>
        {error && <p className="text-destructive text-sm text-center">{error}</p>}
        <form onSubmit={submit} className="space-y-3">
          <input
            placeholder="اسمك المستعار"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            className="w-full h-11 rounded-lg bg-card border px-3 outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-11 rounded-lg bg-card border px-3 outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full h-11 rounded-lg bg-card border px-3 outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-bold">
            {busy ? "جاري الإنشاء..." : "إنشاء الحساب"}
          </button>
        </form>
        <button
          onClick={() => loginWithGoogle().then(() => nav("/home"))}
          className="w-full h-11 rounded-lg bg-secondary font-bold"
        >
          التسجيل بحساب Google
        </button>
        <p className="text-center text-sm text-muted-foreground">
          عندك حساب؟ <Link to="/login" className="text-primary font-bold">دخول</Link>
        </p>
      </div>
    </div>
  );
}
