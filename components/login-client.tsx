"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function LoginClient() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.signIn.oauth2({
      providerId: "authentik",
      callbackURL: window.location.origin + "/",
    });
    if (error) {
      setError(error.message || "Sign-in failed. Please try again.");
      setLoading(false);
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    } else {
      setError("Sign-in did not return a redirect URL.");
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <Shield size={48} />
        <h1>Portglass</h1>
        <p>Network Intelligence Dashboard</p>
        <button className="auth-btn" onClick={handleSignIn} disabled={loading}>
          <Shield size={14} />
          {loading ? "Redirecting…" : "Sign In with Authentik"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
