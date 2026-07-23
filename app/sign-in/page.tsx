import { redirect } from "next/navigation";
import { AtlasMark } from "@/components/brand";
import { SignInCard } from "@/components/auth/sign-in-card";
import { getAtlasSession } from "@/lib/auth-session";

export const metadata = {
  title: "Sign in · Atlas",
  description: "Sign in to your Atlas engineering intelligence workspace.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getAtlasSession();
  if (session) redirect("/app");
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <div className="auth-page__grid" aria-hidden="true" />
      <div className="auth-page__orbit auth-page__orbit--outer" aria-hidden="true" />
      <div className="auth-page__orbit auth-page__orbit--inner" aria-hidden="true" />
      <div className="auth-page__landscape" aria-hidden="true" />
      <header className="auth-brand">
        <AtlasMark />
        <span>Engineering intelligence</span>
      </header>
      <section className="auth-story" aria-label="About Atlas">
        <span>Engineering intelligence, connected</span>
        <h2>Understand your system<br />before you change it.</h2>
        <p>Atlas connects code, architecture, history, and decisions so every change begins with the full picture.</p>
        <div className="auth-story__signal" aria-label="Atlas workspace preview">
          <div><b>31</b><small>Relationships traced</small></div>
          <div><b>5</b><small>Repositories connected</small></div>
          <div><b>1</b><small>Living system model</small></div>
        </div>
      </section>
      <SignInCard error={error} />
      <p className="auth-footer">Atlas · Engineering intelligence for every change</p>
    </main>
  );
}
