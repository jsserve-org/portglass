"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
        <button className="login-btn" onClick={handleSignIn} disabled={loading}>
          {loading ? (
            <>
              <span className="login-spinner" /> Redirecting…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight size={16} />
            </>
          )}
        </button>

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}
