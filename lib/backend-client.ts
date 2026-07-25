import "server-only";

import { headers } from "next/headers";
import { auth } from "./auth";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function fetchAtlasApi(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { token } = await auth.api.getToken({ headers: await headers() });
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("Authorization", `Bearer ${token}`);

  return fetch(new URL(path, backendUrl), {
    ...init,
    headers: requestHeaders,
  });
}
