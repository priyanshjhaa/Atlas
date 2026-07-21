"use client";

import { GitBranch, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInCard({ error }: { error?: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(error ? "GitHub could not complete sign-in. Please try again." : "");

  async function signIn() {
    setPending(true);
    setMessage("");

    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/app",
      errorCallbackURL: "/sign-in?error=oauth",
    });

    if (result?.error) {
      setMessage(result.error.message ?? "GitHub could not complete sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <section className="sign-in-card">
      <div className="sign-in-card__eyebrow">Engineering intelligence</div>
      <h1>Bring your system<br />into focus.</h1>
      <p>Sign in with your GitHub identity to enter your Atlas workspace.</p>
      <button className="button button--primary sign-in-button" onClick={signIn} disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <GitBranch size={18} />}
        {pending ? "Connecting to GitHub…" : "Continue with GitHub"}
      </button>
      {message && <p className="auth-error" role="alert">{message}</p>}
      <small>Atlas requests your profile and email only. Repository access is connected separately.</small>
    </section>
  );
}
