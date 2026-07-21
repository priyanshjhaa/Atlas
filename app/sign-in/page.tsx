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
      <header className="auth-brand"><AtlasMark /></header>
      <SignInCard error={error} />
      <p className="auth-footer">One identity. Explicit repository access. Evidence you can verify.</p>
    </main>
  );
}
