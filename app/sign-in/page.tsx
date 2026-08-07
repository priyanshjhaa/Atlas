import { redirect } from "next/navigation";
import { AtlasMark } from "@/components/brand";
import { SignInCard } from "@/components/auth/sign-in-card";
import { getAtlasSession } from "@/lib/auth-session";

export const metadata = {
  title: "Sign in · Atlas",
  description: "Sign in to explore your synchronized engineering graph, search indexed context, and run evidence-backed change analysis.",
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
        <span>Living engineering intelligence</span>
      </header>
      <SignInCard error={error} />
      <p className="auth-footer">Atlas · Architecture, search, and change impact in one living map</p>
    </main>
  );
}
