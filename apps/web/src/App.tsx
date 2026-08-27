import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Home from "@/pages/Home";
import Room from "@/pages/Room";
import Match from "@/pages/Match";
import Overlay from "@/pages/Overlay";
import Leaderboard from "@/pages/Leaderboard";
import HowToPlay from "@/pages/HowToPlay";

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">جاري التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/home" element={<Private><Home /></Private>} />
          <Route path="/room/:roomId" element={<Private><Room /></Private>} />
          <Route path="/match/:matchId" element={<Match />} />
          <Route path="/overlay/:roomId" element={<Overlay />} />
          <Route path="/leaderboard" element={<Private><Leaderboard /></Private>} />
          <Route path="/how-to-play" element={<HowToPlay />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
