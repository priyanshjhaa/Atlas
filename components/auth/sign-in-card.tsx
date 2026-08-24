"use client";

import Link from "next/link";
import { ArrowLeft, FileText, GitBranch, LoaderCircle } from "lucide-react";
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
      callbackURL: "/app/onboarding",
      errorCallbackURL: "/sign-in?error=oauth",
    });

    if (result?.error) {
      setMessage(result.error.message ?? "GitHub could not complete sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <section className="sign-in-card">
      <Link className="sign-in-card__back" href="/">
        <ArrowLeft size={14} /> Back to landing page
      </Link>
      <div className="sign-in-card__eyebrow"><span /> Sign in to Atlas</div>
      <h1>Open your<br />system map.</h1>
      <p>Use GitHub for your Atlas identity. During setup, choose the repositories and optional Notion workspace that may provide engineering context.</p>
      <button className="button button--primary sign-in-button" onClick={signIn} disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <GitBranch size={18} />}
        {pending ? "Connecting to GitHub…" : "Continue with GitHub"}
      </button>
      {message && <p className="auth-error" role="alert">{message}</p>}
      <div className="auth-source-preview" aria-label="Available context sources">
        <div><GitBranch size={15} /><span><b>GitHub</b><small>Identity, code, and history</small></span></div>
        <div><FileText size={15} /><span><b>Notion</b><small>Optional decisions and docs</small></span></div>
      </div>
      <div className="sign-in-card__rule"><span>Separate, revocable access</span></div>
      <small>Sign-in requests profile and email only. Repository and Notion access are connected explicitly after authentication.</small>
    </section>
  );
}
