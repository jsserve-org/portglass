"use client";

import { useEffect, useState } from 'react';
import { LogOut, Shield, User } from 'lucide-react';
import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient({ baseURL: '' });

export default function AuthNav() {
  const [mounted, setMounted] = useState(false);
  const [authAvailable, setAuthAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setAuthAvailable(d !== null))
      .catch(() => setAuthAvailable(false));
  }, []);

  const { data: session, isPending } = (authClient as any).useSession();

  if (!mounted || authAvailable === null) return null;

  if (!session && !isPending) {
    return (
      <button
        className="auth-btn"
        onClick={() => (authClient as any).signIn.oauth2({ providerId: 'authentik', callbackURL: window.location.href })}
      >
        <Shield size={14} />
        Sign In
      </button>
    );
  }

  if (isPending) {
    return <span className="auth-loading">Loading…</span>;
  }

  const user = session?.user;
  return (
    <div className="auth-user">
      {user?.image ? (
        <img src={user.image} alt="" className="auth-avatar" />
      ) : (
        <div className="auth-avatar-fallback">
          <User size={14} />
        </div>
      )}
      <span className="auth-name">{user?.name || user?.email || 'User'}</span>
      <button className="auth-logout" onClick={() => authClient.signOut()} title="Sign out">
        <LogOut size={14} />
      </button>
    </div>
  );
}
