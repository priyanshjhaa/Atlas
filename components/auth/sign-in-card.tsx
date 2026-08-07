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
      <div className="sign-in-card__eyebrow"><span /> Sign in to Atlas</div>
      <h1>Open your<br />system map.</h1>
      <p>Continue with GitHub to explore synchronized architecture, search indexed engineering context, and analyze changes with source-backed evidence.</p>
      <button className="button button--primary sign-in-button" onClick={signIn} disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <GitBranch size={18} />}
        {pending ? "Connecting to GitHub…" : "Continue with GitHub"}
      </button>
      {message && <p className="auth-error" role="alert">{message}</p>}
      <div className="sign-in-card__rule"><span>Secure sign-in</span></div>
      <small>Atlas requests your profile and email only.<br />Repository access is always connected separately.</small>
    </section>
  );
}
