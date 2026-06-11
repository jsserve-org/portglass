"use client";

import { useEffect, useState } from "react";
import { LogOut, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type UserInfo = { id: string; name?: string; email?: string; image?: string };

export default function AuthNav() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    setMounted(true);
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  if (!mounted) return null;
  if (!user) return null;

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
