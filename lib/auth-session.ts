import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type AtlasSession } from "./auth";

export async function getAtlasSession(): Promise<AtlasSession | null> {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}

export async function requireAtlasSession(): Promise<AtlasSession> {
  const session = await getAtlasSession();
  if (!session) redirect("/sign-in");
  return session;
}
