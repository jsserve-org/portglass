"use client";

import { useState } from "react";
import { Shield, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function LoginClient({ callbackPath = "/" }: { callbackPath?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.signIn.oauth2({
      providerId: "authentik",
      callbackURL: window.location.origin + callbackPath,
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
        <div className="login-brand">
          <span className="login-mark">
            <Shield size={22} />
          </span>
          <span className="login-wordmark">portglass</span>
        </div>

        <div className="login-copy">
          <h1 className="login-title">Sign in to your dashboard</h1>
          <p className="login-sub">
            Port-scan intelligence for your authorized infrastructure.
          </p>
        </div>

        <button className="login-btn" onClick={handleSignIn} disabled={loading}>
          {loading ? (
            <>
              <span className="login-spinner" /> Redirecting…
            </>
          ) : (
            <>
              Continue with Authentik
              <ArrowRight size={16} />
            </>
          )}
        </button>

        {error && <p className="login-error">{error}</p>}

        <p className="login-foot">Authorized access only · Single sign-on via Authentik</p>
      </div>
    </div>
  );
}
