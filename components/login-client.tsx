"use client";

import { Shield } from "lucide-react";

export default function LoginClient() {
  const handleSignIn = async () => {
    const callbackURL = window.location.origin + "/";
    const res = await fetch("/api/auth/sign-in/oauth2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "authentik", callbackURL }),
    });
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <Shield size={48} />
        <h1>Portglass</h1>
        <p>Network Intelligence Dashboard</p>
        <button className="auth-btn" onClick={handleSignIn}>
          <Shield size={14} />
          Sign In with Authentik
        </button>
      </div>
    </div>
  );
}
