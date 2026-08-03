import { randomUUID } from "node:crypto";

const acceptedRequestId = /^[a-zA-Z0-9._:-]{1,128}$/;

export function requestIdFromHeader(
  value: string | string[] | undefined,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && acceptedRequestId.test(candidate)
    ? candidate
    : randomUUID();
}

export function safeRequestPath(value: string | undefined): string {
  if (!value) return "/";
  try {
    return new URL(value, "http://atlas.invalid").pathname;
  } catch {
    return "/invalid";
  }
}
