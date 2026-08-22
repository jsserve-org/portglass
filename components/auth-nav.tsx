"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type UserInfo = { id: string; name?: string; email?: string; image?: string };

export default function AuthNav() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setAuthEnabled(!!d.authEnabled);
      })
      .catch(() => {
        setUser(null);
        setAuthEnabled(false);
      });
  }, []);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/login";
  };

  // Reserve a fixed-size slot until the session resolves so the sticky header
  // doesn't visibly jump when the chip pops in.
  if (!mounted) return <div className="auth-user auth-loading" style={{ minHeight: 28, width: 96 }} aria-hidden="true" />;

  // Signed in: show the account chip + sign-out.
  if (user) {
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
        <button className="auth-logout" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  // Auth is on but no session: offer a sign-in link so the nav is never empty
  // and it's obvious you're signed out (rather than silently showing nothing).
  if (authEnabled) {
    return (
      <Link href="/login" className="auth-btn">
        <LogIn size={14} />
        <span className="auth-name">Sign in</span>
      </Link>
    );
  }

  // Auth disabled entirely (no Authentik config): nothing to show.
  return null;
}
