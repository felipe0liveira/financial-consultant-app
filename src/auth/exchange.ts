import { env } from "../config/env";
import type { StoredSession } from "./session";

export type ExchangeOutcome =
  | { kind: "ok"; session: StoredSession }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "network" };

/** Exchanges a Google ID token for a BFF mobile session (POST /api/auth/mobile). */
export async function exchangeIdToken(
  idToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<ExchangeOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${env.bffUrl}/api/auth/mobile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    return { kind: "network" };
  }
  if (res.status === 503) return { kind: "unavailable" };
  if (!res.ok) return { kind: "rejected" };
  try {
    const body = (await res.json()) as StoredSession;
    if (!body.token || !body.expiresAt || !body.profile) return { kind: "rejected" };
    return { kind: "ok", session: body };
  } catch {
    return { kind: "rejected" };
  }
}
