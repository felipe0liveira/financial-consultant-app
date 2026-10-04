import { env } from "../config/env";

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("session expired");
    this.name = "SessionExpiredError";
  }
}

/** Hooks the AuthProvider installs so the client can read and renew the session. */
export interface AuthHooks {
  getToken(): string | null;
  /** Renews the session; resolves the new token, or null when renewal failed for good. */
  renew(): Promise<string | null>;
  /** Called when the session is unrecoverable: sign out locally. */
  onExpired(): void;
}

let hooks: AuthHooks | null = null;
export function installAuthHooks(h: AuthHooks | null): void {
  hooks = h;
}

async function send(path: string, init: RequestInit, token: string | null, fetchImpl: typeof fetch) {
  try {
    return await fetchImpl(`${env.bffUrl}/api/v1/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new NetworkError();
  }
}

/** Calls a BFF /api/v1 route with the bearer; on 401 renews once and retries once. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  if (!hooks) throw new SessionExpiredError();
  let res = await send(path, init, hooks.getToken(), fetchImpl);

  if (res.status === 401) {
    const renewed = await hooks.renew();
    if (!renewed) {
      hooks.onExpired();
      throw new SessionExpiredError();
    }
    res = await send(path, init, renewed, fetchImpl);
    if (res.status === 401) {
      hooks.onExpired();
      throw new SessionExpiredError();
    }
  }

  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(`API ${path} failed: ${res.status}`, res.status, body);
  return body as T;
}
