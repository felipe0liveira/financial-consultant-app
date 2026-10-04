export interface Profile {
  name: string;
  email: string;
  picture: string | null;
}

export interface StoredSession {
  token: string;
  /** ISO-8601 instant from the BFF exchange. */
  expiresAt: string;
  profile: Profile;
}

/** Renew when expired or expiring within 24 hours (spec R10). */
export const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export function needsRenewal(session: StoredSession, now: number = Date.now()): boolean {
  const expires = Date.parse(session.expiresAt);
  if (Number.isNaN(expires)) return true;
  return expires - now <= RENEWAL_WINDOW_MS;
}

export function isExpired(session: StoredSession, now: number = Date.now()): boolean {
  const expires = Date.parse(session.expiresAt);
  return Number.isNaN(expires) || expires <= now;
}

/** Up to two initials for the avatar fallback (spec R18). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function displayName(profile: Profile): string {
  return profile.name.trim() || "Usuário";
}

export function firstName(profile: Profile): string {
  return displayName(profile).split(/\s+/)[0];
}
