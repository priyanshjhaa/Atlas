import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AtlasMark } from "@/components/brand";
import { SignInCard } from "@/components/auth/sign-in-card";
import { getAtlasSession } from "@/lib/auth-session";

export const metadata = {
  title: "Sign in · Atlas",
  description: "Sign in with GitHub, then connect approved repository and Notion context for evidence-backed engineering analysis.",
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
        <Link className="auth-brand__back" href="/">
          <ArrowLeft size={14} /> Back to landing page
        </Link>
      </header>
      <SignInCard error={error} />
      <p className="auth-footer">Atlas · Code, history, and decisions in one living map</p>
    </main>
  );
}
