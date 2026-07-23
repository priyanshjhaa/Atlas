import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AtlasSession } from "./auth";

export async function getAtlasSession(): Promise<AtlasSession | null> {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireAtlasSession(): Promise<AtlasSession> {
  const session = await getAtlasSession();
  if (!session) redirect("/sign-in");
  return session;
}
