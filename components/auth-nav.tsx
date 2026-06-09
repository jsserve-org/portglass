"use client";

import { useEffect, useState } from "react";
import { LogOut, Shield, User } from "lucide-react";

type MeResponse = { user: { id: string; name?: string; email?: string; image?: string } | null };

export default function AuthNav() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<MeResponse["user"]>(undefined);

  useEffect(() => {
    setMounted(true);
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: MeResponse) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const handleSignIn = () => {
    const callback = window.location.href;
    window.location.href = `/api/auth/oauth2/authorize?providerId=authentik&callbackURL=${encodeURIComponent(callback)}`;
  };

  const handleSignOut = () => {
    fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).finally(() => {
      window.location.reload();
    });
  };

  if (!mounted || user === undefined) return null;

  if (!user) {
    return (
      <button className="auth-btn" onClick={handleSignIn}>
        <Shield size={14} />
        Sign In
      </button>
    );
  }

  return (
    <div className="auth-user">
      {user.image ? (
        <img src={user.image} alt="" className="auth-avatar" />
      ) : (
        <div className="auth-avatar-fallback">
          <User size={14} />
        </div>
      )}
      <span className="auth-name">{user.name || user.email || "User"}</span>
      <button className="auth-logout" onClick={handleSignOut} title="Sign out">
        <LogOut size={14} />
      </button>
    </div>
  );
}
