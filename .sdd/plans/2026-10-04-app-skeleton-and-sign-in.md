# Plan: iOS App Skeleton & Google Sign-In (Phase 1)

**Execution mode:** subagent-driven (default).
**Spec:** `.sdd/specs/2026-10-04-app-skeleton-and-sign-in.md`
**Depends on:** `financial-consultant-web/.sdd/plans/2026-10-04-mobile-auth-gateway.md` —
`POST /api/auth/mobile` and bearer support on `/api/v1/*` must exist (locally) before Task 13's
end-to-end checks. Tasks 1–12 do not need it.

## Design decisions made here (spec left them to implementation)

- **Expo SDK:** whatever `create-expo-app@latest` resolves at scaffold time, pinned by the
  lockfile. Current SDKs (56+) support iOS 16.4+, so the spec's iOS 17 target is inside the
  supported range; they require **Xcode 26.4+**. The Mac currently has only the Command Line
  Tools, so installing Xcode is a manual prerequisite (Task 0).
- **Project layout:** single Expo app at the repo root; routes in `src/app/` (Expo Router),
  everything else under `src/`. `docs/` and `.sdd/` stay untouched.
- **Navigation:** Expo Router's stable JS `Tabs` (not the `unstable-native-tabs` API), with a
  nested `Stack` inside **Mais**. Auth gating with `Stack.Protected` in the root layout.
- **Google Sign-In:** `@react-native-google-signin/google-signin` with its Expo config plugin
  (no Firebase). Configured with `iosClientId` only, so the ID token's audience is the **iOS
  client** — what the BFF allow-list expects.
  *Risk:* the library's docs state the ID token may require a `webClientId`. Task 6 starts with a
  spike that inspects the token's `aud`. If the token is missing without `webClientId`, the
  fallback is a **dedicated** Web-type OAuth client created only for mobile backend verification
  (never the web app's own client), passed as `webClientId` and added to the BFF's
  `MOBILE_OAUTH_CLIENT_IDS`. This keeps the gateway spec's R4 intact (the web app's client stays
  rejected).
- **Fresh ID token for renewal:** `GoogleSignin.signInSilently()` then `GoogleSignin.getTokens()`
  (which refreshes an expired ID token), then exchange at the BFF.
- **Session storage:** `expo-secure-store` (Keychain) holds `{ token, expiresAt, profile }` as one
  JSON item. Theme preference (non-sensitive) in `@react-native-async-storage/async-storage`.
- **Environments:** `app.config.ts` reads `APP_ENV` (`development` default | `production`) and
  writes `extra.bffUrl`: `http://localhost:3000` for development, `PROD_BFF_URL` (env) for
  production. Runtime reads `Constants.expoConfig.extra`. The iOS client ID and its reversed URL
  scheme are public identifiers read from env at config time.
- **Builds:** development = `bunx expo run:ios` (local dev build on the Simulator). Production /
  TestFlight = **EAS Build + EAS Submit** (`eas.json` profile `production` with
  `APP_ENV=production`), because it manages signing certificates and the upload for a single
  developer. Requires a free Expo account and the paid Apple Developer Program — both
  developer-owned.
- **Offline detection (R12):** a request that fails before getting an HTTP response is classified
  as `network`; renewal is retried on `@react-native-community/netinfo` reconnect and on
  foreground. Network failures never sign the user out.
- **Error classification from the BFF exchange:** 401 → `rejected`; 503 → `unavailable`
  (treated like offline during renewal, a "try again" message on login); network → `network`;
  anything else → `rejected`.
- **Tests:** `jest-expo` preset (Expo's documented test setup) for pure logic and the API client;
  screens are covered by the manual checklist in Task 13.
- **Fonts/icons:** `@expo-google-fonts/bitter` (400/600/700) via `expo-font`; tab icons from
  `@expo/vector-icons` (Ionicons) — keeps the Android door open.
- **Placeholder copy** "Em breve por aqui." and a temporary icon/splash on `canvas` colours
  (spec open questions, taken as stated).

---

### Task 0 — Developer prerequisites (manual)

**Files:** none

- [ ] Install **Xcode 26.4+** from the App Store, open it once, accept the license, install the
  iOS Simulator runtime, then:
  Run: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer && xcodebuild -version`
  — expect `Xcode 26.x`.
- [ ] GCP project `financial-consultant-501119` → APIs & Services → Credentials → Create OAuth
  client ID → **iOS**, bundle ID `com.felipeoliveira.financialconsultant`. Note the **client ID**
  and the **iOS URL scheme** (`com.googleusercontent.apps.<…>`).
- [ ] In `financial-consultant-web/.env.local`, set `MOBILE_OAUTH_CLIENT_IDS=<iOS client ID>`.

---

### Task 1 — Scaffold the Expo project

**Files:** `package.json` (new), `bun.lock` (new), `tsconfig.json` (new), `app.json` (new, deleted in Task 2), `.gitignore` (new), `src/app/_layout.tsx` (new), `src/app/index.tsx` (new), `assets/` (new)

- [ ] Scaffold into a temp dir, then move into the repo root (which already holds `docs/`, `.sdd/`):

```bash
cd /Volumes/Sandisk/@development/personal/@financial-consultant
bunx create-expo-app@latest fc-app-tmp --template default --no-install
rsync -a --exclude .git fc-app-tmp/ financial-consultant-app/
rm -rf fc-app-tmp
cd financial-consultant-app && bun install
```

- [ ] Run the template's reset script and move routes under `src/` if the template didn't:
  Run: `bun run reset-project` (answer "n" to keeping the example) — then ensure the route root
  is `src/app/` (`mkdir -p src && git mv app src/app` if it was created at `./app`). Delete the
  `reset-project` script entry and `scripts/reset-project.js`.
- [ ] Run: `bunx expo install --check` — expect no mismatches.
- [ ] Run: `bunx tsc --noEmit` — expect exit 0.
- [ ] `git commit -m "chore: scaffold expo app"`

---

### Task 2 — App config, environments and native settings

**Files:** `app.config.ts` (new), `app.json` (deleted), `eas.json` (new), `.env.example` (new), `src/config/env.ts` (new), `src/config/brand.ts` (new)

- [ ] Run: `bunx expo install expo-build-properties expo-constants @react-native-google-signin/google-signin expo-secure-store @react-native-async-storage/async-storage @react-native-community/netinfo expo-font @expo-google-fonts/bitter`
- [ ] Create `app.config.ts` (and delete `app.json`, carrying over any template-only fields it had
  such as `newArchEnabled`/`experiments`):

```ts
import type { ExpoConfig } from "expo/config";

const APP_ENV = (process.env.APP_ENV ?? "development") as "development" | "production";

const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
if (!iosUrlScheme) {
  throw new Error("GOOGLE_IOS_URL_SCHEME is not set (see .env.example)");
}

const bffUrl =
  APP_ENV === "production" ? process.env.PROD_BFF_URL : "http://localhost:3000";
if (!bffUrl) throw new Error("PROD_BFF_URL is not set for a production build");

const config: ExpoConfig = {
  name: "Financial Consultant",
  slug: "financial-consultant",
  scheme: "financialconsultant",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/images/icon.png",
  ios: {
    bundleIdentifier: "com.felipeoliveira.financialconsultant",
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-build-properties", { ios: { deploymentTarget: "17.0" } }],
    ["@react-native-google-signin/google-signin", { iosUrlScheme }],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 120,
        backgroundColor: "#E9B48F",
        dark: { backgroundColor: "#241C16" },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnv: APP_ENV,
    bffUrl,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    googleServerClientId: process.env.GOOGLE_SERVER_CLIENT_ID || undefined,
  },
};

export default config;
```

- [ ] Create `.env.example`:

```bash
# Public identifiers only — no secrets ever go in this app.
# iOS OAuth client (GCP project financial-consultant-501119, bundle ID
# com.felipeoliveira.financialconsultant).
GOOGLE_IOS_CLIENT_ID=
# Reversed client ID, e.g. com.googleusercontent.apps.1234-abcd
GOOGLE_IOS_URL_SCHEME=
# Only if the ID token needs a server client (see plan design decisions);
# must be a mobile-dedicated Web client, never the web app's own client.
GOOGLE_SERVER_CLIENT_ID=
# Production BFF origin (Cloud Run URL of financial-consultant-web).
PROD_BFF_URL=
```

  Copy it to `.env` (git-ignored) and fill in the values from Task 0.
- [ ] Create `eas.json`:

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "APP_ENV": "development" }
    },
    "production": {
      "autoIncrement": true,
      "env": { "APP_ENV": "production" }
    }
  },
  "submit": { "production": {} }
}
```

- [ ] Create `src/config/env.ts`:

```ts
import Constants from "expo-constants";

interface Extra {
  appEnv: "development" | "production";
  bffUrl: string;
  googleIosClientId?: string;
  googleServerClientId?: string;
}

const extra = Constants.expoConfig?.extra as Extra | undefined;
if (!extra?.bffUrl || !extra.googleIosClientId) {
  throw new Error("App config is missing bffUrl or googleIosClientId");
}

export const env = {
  appEnv: extra.appEnv,
  bffUrl: extra.bffUrl.replace(/\/$/, ""),
  googleIosClientId: extra.googleIosClientId,
  googleServerClientId: extra.googleServerClientId,
} as const;
```

- [ ] Create `src/config/brand.ts` (R22):

```ts
/** Provisional product name — the single place to change when the product is named. */
export const BRAND_NAME = "Financial Consultant";
export const BRAND_TAGLINE = "Suas contas do mês, sempre sob controle.";
```

- [ ] Ensure `.gitignore` contains `.env` and `.env.local` (not `.env.example`), `ios/` and `android/`
  (continuous native generation — native dirs are regenerated by prebuild).
- [ ] Run: `bunx expo config --type public` — expect `ios.bundleIdentifier` =
  `com.felipeoliveira.financialconsultant` and `extra.bffUrl` = `http://localhost:3000`.
- [ ] Run: `APP_ENV=production PROD_BFF_URL=https://example.invalid bunx expo config --type public | grep bffUrl`
  — expect the production URL.
- [ ] Run: `bunx tsc --noEmit` — expect exit 0.
- [ ] `git commit -m "feat: add app config, environments and native settings"`

---

### Task 3 — Test runner

**Files:** `package.json` (modified), `bun.lock` (modified), `jest.config.js` (new)

- [ ] Run: `bunx expo install jest-expo jest @types/jest -- --dev`
- [ ] Create `jest.config.js`:

```js
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
};
```

- [ ] Add scripts to `package.json`: `"test": "jest"`, `"typecheck": "tsc --noEmit"`,
  `"lint": "expo lint"`.
- [ ] Run: `bun run test --passWithNoTests` — expect exit 0.
- [ ] `git commit -m "chore: add jest-expo test runner"`

---

### Task 4 — Design tokens and theme

**Files:** `src/theme/tokens.ts` (new), `src/theme/ThemeProvider.tsx` (new), `src/theme/__tests__/resolve-scheme.test.ts` (new)

- [ ] Create `src/theme/tokens.ts` (values from `docs/03-design-system.md`, R21):

```ts
export const palette = {
  light: {
    canvas: "#E9B48F", panel: "#FFFCF8", sidebar: "#F6ECE0", card: "#FBF4EC",
    ink: "#33281F", inkSoft: "#6E6156", inkFaint: "#9C8E80", hair: "#EADFD1",
    accent: "#E1552F", accentPressed: "#C94420", amber: "#E39A2B",
    ok: "#3E7A5E", okBg: "#E1EEE6", warn: "#96601A", warnBg: "#F8E7C9",
    danger: "#B23A1F", dangerBg: "#F8DED4",
  },
  dark: {
    canvas: "#241C16", panel: "#2C231C", sidebar: "#271F18", card: "#342A21",
    ink: "#F3E9DF", inkSoft: "#C3B4A5", inkFaint: "#8E7F70", hair: "#3D3128",
    accent: "#F0714E", accentPressed: "#F5866B", amber: "#EBA744",
    ok: "#8FCDAF", okBg: "#253A31", warn: "#E7B25E", warnBg: "#3E301A",
    danger: "#EE8064", dangerBg: "#43261D",
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };

export const radii = { panel: 30, card: 18, button: 12 } as const;

export const fonts = {
  display: "Bitter_700Bold",
  displaySemi: "Bitter_600SemiBold",
  displayRegular: "Bitter_400Regular",
} as const;

export type ThemePreference = "light" | "dark" | "system";

/** Resolves the effective scheme from the user's preference and the OS appearance. */
export function resolveScheme(
  preference: ThemePreference,
  system: "light" | "dark" | null | undefined
): ColorScheme {
  if (preference === "system") return system === "dark" ? "dark" : "light";
  return preference;
}
```

- [ ] Create `src/theme/ThemeProvider.tsx` (R20):

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { palette, resolveScheme, type ColorScheme, type Colors, type ThemePreference } from "./tokens";

const STORAGE_KEY = "fc-theme-preference";

interface ThemeValue {
  scheme: ColorScheme;
  colors: Colors;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setPreferenceState(v);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = resolveScheme(preference, system);
    return {
      scheme,
      colors: palette[scheme],
      preference,
      setPreference: (p) => {
        setPreferenceState(p);
        AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
      },
    };
  }, [preference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = use(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
```

- [ ] Create `src/theme/__tests__/resolve-scheme.test.ts`:

```ts
import { resolveScheme } from "../tokens";

test("system follows the OS", () => {
  expect(resolveScheme("system", "dark")).toBe("dark");
  expect(resolveScheme("system", "light")).toBe("light");
  expect(resolveScheme("system", null)).toBe("light");
});

test("explicit preference wins over the OS", () => {
  expect(resolveScheme("light", "dark")).toBe("light");
  expect(resolveScheme("dark", "light")).toBe("dark");
});
```

- [ ] Run: `bun run test && bun run typecheck` — expect pass.
- [ ] `git commit -m "feat(theme): add design tokens and theme provider"`

---

### Task 5 — Session policy (pure)

**Files:** `src/auth/session.ts` (new), `src/auth/__tests__/session.test.ts` (new)

- [ ] Create `src/auth/session.ts`:

```ts
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
```

- [ ] Create `src/auth/__tests__/session.test.ts`:

```ts
import { displayName, initials, isExpired, needsRenewal, type StoredSession } from "../session";

const H = 60 * 60 * 1000;
const now = Date.parse("2026-10-04T12:00:00Z");
const at = (ms: number): StoredSession => ({
  token: "t",
  expiresAt: new Date(now + ms).toISOString(),
  profile: { name: "Ana Souza", email: "a@b.c", picture: null },
});

test("renews when expired", () => expect(needsRenewal(at(-1), now)).toBe(true));
test("renews within 24h", () => expect(needsRenewal(at(23 * H), now)).toBe(true));
test("does not renew beyond 24h", () => expect(needsRenewal(at(25 * H), now)).toBe(false));
test("invalid expiry renews", () =>
  expect(needsRenewal({ ...at(0), expiresAt: "nope" }, now)).toBe(true));
test("isExpired", () => {
  expect(isExpired(at(-1), now)).toBe(true);
  expect(isExpired(at(H), now)).toBe(false);
});
test("initials", () => {
  expect(initials("Ana Souza")).toBe("AS");
  expect(initials("ana")).toBe("A");
  expect(initials("  ")).toBe("U");
});
test("displayName falls back to Usuário", () =>
  expect(displayName({ name: " ", email: "", picture: null })).toBe("Usuário"));
```

- [ ] Run: `bun run test` — expect pass.
- [ ] `git commit -m "feat(auth): add session renewal policy and profile helpers"`

---

### Task 6 — Google sign-in, BFF exchange and secure storage

**Files:** `src/auth/google.ts` (new), `src/auth/exchange.ts` (new), `src/auth/session-store.ts` (new), `src/auth/__tests__/exchange.test.ts` (new)
**Needs context from:** Task 5 — `StoredSession` and `Profile` types; Task 2 — `env.bffUrl`, `env.googleIosClientId`, `env.googleServerClientId`

- [ ] **Spike first (audience check):** after Task 9 lands a login button, or with a temporary
  button on `src/app/index.tsx`, run a dev build, sign in, and decode the ID token
  (`JSON.parse(atob(idToken.split(".")[1]))`) in a `console.log`. Expect `aud` = the iOS client
  ID and `idToken` non-null **without** `GOOGLE_SERVER_CLIENT_ID`. If not, apply the fallback in
  the design decisions (dedicated mobile Web client → `GOOGLE_SERVER_CLIENT_ID` + BFF allow-list)
  and record the outcome in `docs/02-api-and-auth.md`. Remove the temporary log/button.
- [ ] Create `src/auth/google.ts`:

```ts
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { env } from "../config/env";

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({
    iosClientId: env.googleIosClientId,
    ...(env.googleServerClientId ? { webClientId: env.googleServerClientId } : {}),
  });
  configured = true;
}

export type GoogleResult =
  | { kind: "ok"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "no_credential" }
  | { kind: "error"; message: string };

/** Interactive sign-in (login button). */
export async function signInInteractive(): Promise<GoogleResult> {
  configure();
  try {
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return { kind: "cancelled" };
    const idToken = res.data.idToken ?? (await GoogleSignin.getTokens()).idToken;
    return idToken ? { kind: "ok", idToken } : { kind: "error", message: "missing id token" };
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return { kind: "cancelled" };
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Silent renewal: restore the previous Google sign-in and get a fresh ID token. */
export async function freshIdTokenSilently(): Promise<GoogleResult> {
  configure();
  try {
    const res = await GoogleSignin.signInSilently();
    if (!isSuccessResponse(res)) return { kind: "no_credential" };
    const { idToken } = await GoogleSignin.getTokens();
    return idToken ? { kind: "ok", idToken } : { kind: "no_credential" };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Signs out of Google on this device so the next login shows the account chooser (R19). */
export async function googleSignOut(): Promise<void> {
  configure();
  try {
    await GoogleSignin.signOut();
  } catch {
    // Local sign-out must never fail the app's own sign-out.
  }
}
```

- [ ] Create `src/auth/exchange.ts`:

```ts
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
```

- [ ] Create `src/auth/session-store.ts` (R9):

```ts
import * as SecureStore from "expo-secure-store";
import type { StoredSession } from "./session";

const KEY = "fc.session";

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] Create `src/auth/__tests__/exchange.test.ts`:

```ts
jest.mock("../../config/env", () => ({ env: { bffUrl: "http://bff" } }));
import { exchangeIdToken } from "../exchange";

const ok = { token: "t", expiresAt: "2026-10-11T00:00:00Z", profile: { name: "A", email: "a@b", picture: null } };
const resp = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

test("posts the id token and returns the session", async () => {
  const f = jest.fn().mockResolvedValue(resp(200, ok));
  const r = await exchangeIdToken("id", f);
  expect(f).toHaveBeenCalledWith("http://bff/api/auth/mobile", expect.objectContaining({ method: "POST", body: JSON.stringify({ idToken: "id" }) }));
  expect(r).toEqual({ kind: "ok", session: ok });
});
test("401 is rejected", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockResolvedValue(resp(401, {})))).toEqual({ kind: "rejected" });
});
test("503 is unavailable", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockResolvedValue(resp(503, {})))).toEqual({ kind: "unavailable" });
});
test("thrown fetch is network", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockRejectedValue(new TypeError("Network request failed")))).toEqual({ kind: "network" });
});
test("malformed body is rejected", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockResolvedValue(resp(200, { nope: 1 })))).toEqual({ kind: "rejected" });
});
```

- [ ] Run: `bun run test && bun run typecheck` — expect pass.
- [ ] `git commit -m "feat(auth): add google sign-in, bff exchange and secure session storage"`

---

### Task 7 — Authenticated API client with one-shot renewal

**Files:** `src/api/client.ts` (new), `src/api/__tests__/client.test.ts` (new)
**Needs context from:** Task 2 — `env.bffUrl`

- [ ] Create `src/api/client.ts` (R11):

```ts
import { env } from "../config/env";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = "ApiError";
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
```

- [ ] Create `src/api/__tests__/client.test.ts`:

```ts
jest.mock("../../config/env", () => ({ env: { bffUrl: "http://bff" } }));
import { apiFetch, installAuthHooks, NetworkError, SessionExpiredError } from "../client";

const resp = (status: number, body: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

function setup(renewTo: string | null) {
  const h = { getToken: () => "old", renew: jest.fn().mockResolvedValue(renewTo), onExpired: jest.fn() };
  installAuthHooks(h);
  return h;
}

test("sends the bearer and returns json", async () => {
  setup("new");
  const f = jest.fn().mockResolvedValue(resp(200, { user_id: "u1" }));
  await expect(apiFetch("me", {}, f)).resolves.toEqual({ user_id: "u1" });
  expect(f.mock.calls[0][0]).toBe("http://bff/api/v1/me");
  expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer old");
});

test("401 → renew once → retry with the new token", async () => {
  const h = setup("new");
  const f = jest.fn().mockResolvedValueOnce(resp(401)).mockResolvedValueOnce(resp(200, { ok: 1 }));
  await expect(apiFetch("me", {}, f)).resolves.toEqual({ ok: 1 });
  expect(h.renew).toHaveBeenCalledTimes(1);
  expect(f.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
});

test("renewal failure signs out", async () => {
  const h = setup(null);
  const f = jest.fn().mockResolvedValue(resp(401));
  await expect(apiFetch("me", {}, f)).rejects.toBeInstanceOf(SessionExpiredError);
  expect(h.onExpired).toHaveBeenCalled();
});

test("second 401 signs out without a second renewal", async () => {
  const h = setup("new");
  const f = jest.fn().mockResolvedValue(resp(401));
  await expect(apiFetch("me", {}, f)).rejects.toBeInstanceOf(SessionExpiredError);
  expect(h.renew).toHaveBeenCalledTimes(1);
  expect(h.onExpired).toHaveBeenCalled();
});

test("network failure is a NetworkError, not a sign-out", async () => {
  const h = setup("new");
  const f = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
  await expect(apiFetch("me", {}, f)).rejects.toBeInstanceOf(NetworkError);
  expect(h.onExpired).not.toHaveBeenCalled();
});
```

- [ ] Run: `bun run test` — expect pass.
- [ ] `git commit -m "feat(api): add bearer api client with one-shot renewal"`

---

### Task 8 — AuthProvider (launch, foreground, reconnect renewal; sign-out)

**Files:** `src/auth/AuthProvider.tsx` (new)
**Needs context from:** Task 5 — `needsRenewal`, `isExpired`, `StoredSession`; Task 6 — `signInInteractive`, `freshIdTokenSilently`, `googleSignOut`, `exchangeIdToken`, `loadSession`/`saveSession`/`clearSession`; Task 7 — `installAuthHooks`, `apiFetch`

- [ ] Create `src/auth/AuthProvider.tsx`:

```tsx
import NetInfo from "@react-native-community/netinfo";
import {
  createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { apiFetch, installAuthHooks } from "../api/client";
import { exchangeIdToken } from "./exchange";
import { freshIdTokenSilently, googleSignOut, signInInteractive } from "./google";
import { isExpired, needsRenewal, type StoredSession } from "./session";
import { clearSession, loadSession, saveSession } from "./session-store";

export type SignInError = "rejected" | "network" | "unavailable" | "google";
type RenewResult = "renewed" | "deferred" | "failed";

interface AuthValue {
  status: "loading" | "signedOut" | "signedIn";
  session: StoredSession | null;
  userId: string | null;
  /** Message to show on the login screen after an involuntary sign-out. */
  notice: string | null;
  signIn(): Promise<SignInError | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const EXPIRED_NOTICE = "Sua sessão expirou. Entre novamente para continuar.";

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const renewing = useRef<Promise<RenewResult> | null>(null);
  const pendingRenewal = useRef(false);

  const adopt = useCallback(async (s: StoredSession) => {
    await saveSession(s);
    sessionRef.current = s;
    setSession(s);
    setStatus("signedIn");
  }, []);

  const signOutLocal = useCallback(async (withNotice: string | null) => {
    sessionRef.current = null;
    setSession(null);
    setUserId(null);
    setNotice(withNotice);
    setStatus("signedOut");
    await clearSession().catch(() => {});
    await googleSignOut();
  }, []);

  /** Single-flight silent renewal. Network/unavailable → "deferred" (never signs out, R12). */
  const renew = useCallback((): Promise<RenewResult> => {
    if (renewing.current) return renewing.current;
    renewing.current = (async (): Promise<RenewResult> => {
      const google = await freshIdTokenSilently();
      if (google.kind === "error") { pendingRenewal.current = true; return "deferred"; }
      if (google.kind !== "ok") return "failed";
      const out = await exchangeIdToken(google.idToken);
      if (out.kind === "ok") { pendingRenewal.current = false; await adopt(out.session); return "renewed"; }
      if (out.kind === "network" || out.kind === "unavailable") { pendingRenewal.current = true; return "deferred"; }
      return "failed";
    })().finally(() => { renewing.current = null; });
    return renewing.current;
  }, [adopt]);

  const loadIdentity = useCallback(async () => {
    try {
      const me = await apiFetch<{ user_id: string }>("me");
      setUserId(me.user_id);
    } catch {
      // Offline or transient: identity is re-fetched on the next foreground.
    }
  }, []);

  /** Renew if due (R10). A failed renewal signs out only when the session is already expired. */
  const renewIfDue = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !needsRenewal(s)) return;
    const r = await renew();
    if (r === "failed" && isExpired(s)) await signOutLocal(EXPIRED_NOTICE);
  }, [renew, signOutLocal]);

  // Install client hooks once.
  useEffect(() => {
    installAuthHooks({
      getToken: () => sessionRef.current?.token ?? null,
      renew: async () => ((await renew()) === "renewed" ? sessionRef.current?.token ?? null : null),
      onExpired: () => { void signOutLocal(EXPIRED_NOTICE); },
    });
    return () => installAuthHooks(null);
  }, [renew, signOutLocal]);

  // Launch (R1, R2, R10).
  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      if (!stored) { setStatus("signedOut"); return; }
      sessionRef.current = stored;
      setSession(stored);
      if (needsRenewal(stored)) {
        const r = await renew();
        if (r === "failed" || (r === "deferred" && isExpired(stored) && !pendingRenewal.current)) {
          await signOutLocal(EXPIRED_NOTICE);
          return;
        }
      }
      setStatus("signedIn");
      void loadIdentity();
    })();
  }, [renew, signOutLocal, loadIdentity]);

  // Foreground (R10) and reconnect (R12).
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") { void renewIfDue(); if (!userId) void loadIdentity(); }
    });
    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected && pendingRenewal.current) void renewIfDue();
    });
    return () => { app.remove(); net(); };
  }, [renewIfDue, loadIdentity, userId]);

  const signIn = useCallback(async (): Promise<SignInError | null> => {
    setNotice(null);
    const google = await signInInteractive();
    if (google.kind === "cancelled" || google.kind === "no_credential") return null; // R6
    if (google.kind === "error") return "google";
    const out = await exchangeIdToken(google.idToken);
    if (out.kind !== "ok") return out.kind; // R7
    await adopt(out.session); // R5
    void loadIdentity(); // R13
    return null;
  }, [adopt, loadIdentity]);

  const value = useMemo<AuthValue>(
    () => ({ status, session, userId, notice, signIn, signOut: () => signOutLocal(null) }),
    [status, session, userId, notice, signIn, signOutLocal]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = use(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
```

- [ ] Run: `bun run typecheck` — expect exit 0.
- [ ] `git commit -m "feat(auth): add auth provider with launch, foreground and reconnect renewal"`

---

### Task 9 — Root layout, route guard and login screen

**Files:** `src/app/_layout.tsx` (modified), `src/app/index.tsx` (deleted), `src/app/login.tsx` (new), `src/ui/Button.tsx` (new), `src/ui/BrandMark.tsx` (new)
**Needs context from:** Task 4 — `ThemeProvider`, `useTheme`, `fonts`, `radii`; Task 8 — `AuthProvider`, `useAuth`, `SignInError`; Task 2 — `BRAND_NAME`, `BRAND_TAGLINE`

- [ ] Create `src/ui/Button.tsx` (R8 no dead taps, R23 labels):

```tsx
import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { radii } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface Props extends Omit<PressableProps, "children"> {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ label, loading, variant = "primary", disabled, ...rest }: Props) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.accent : variant === "danger" ? colors.dangerBg : colors.card;
  const fg = variant === "primary" ? "#FFFFFF" : variant === "danger" ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radii.button,
        borderWidth: variant === "primary" ? 0 : 1,
        borderColor: colors.hair,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }} maxFontSizeMultiplier={1.6}>{label}</Text>
      )}
    </Pressable>
  );
}
```

- [ ] Create `src/ui/BrandMark.tsx` (temporary mark until branding — a coral rounded square with
  the first letter of `BRAND_NAME`):

```tsx
import { Text, View } from "react-native";
import { BRAND_NAME } from "../config/brand";
import { fonts } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export function BrandMark({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={BRAND_NAME}
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: size * 0.5 }}>{BRAND_NAME[0]}</Text>
    </View>
  );
}
```

- [ ] Replace `src/app/_layout.tsx` (R1–R3; fonts; splash held until auth resolves):

```tsx
import { Bitter_400Regular, Bitter_600SemiBold, Bitter_700Bold, useFonts } from "@expo-google-fonts/bitter";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  const { scheme, colors } = useTheme();
  const [fontsLoaded] = useFonts({ Bitter_400Regular, Bitter_600SemiBold, Bitter_700Bold });

  if (status === "loading" || !fontsLoaded) return null;
  SplashScreen.hide();

  const signedIn = status === "signedIn";
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
```

- [ ] Delete `src/app/index.tsx`. Until Task 10 adds `(tabs)`, a signed-in state has no screen;
  that is expected between Tasks 9 and 10.
- [ ] Create `src/app/login.tsx` (R4–R8):

```tsx
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth, type SignInError } from "../auth/AuthProvider";
import { BRAND_NAME, BRAND_TAGLINE } from "../config/brand";
import { fonts } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";
import { BrandMark } from "../ui/BrandMark";
import { Button } from "../ui/Button";

const MESSAGES: Record<SignInError, string> = {
  rejected: "Não foi possível entrar com essa conta. Tente novamente.",
  google: "Não foi possível entrar com o Google. Tente novamente.",
  network: "Sem conexão. Verifique sua internet e tente novamente.",
  unavailable: "O serviço está indisponível no momento. Tente novamente em instantes.",
};

export default function Login() {
  const { colors } = useTheme();
  const { signIn, notice } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPress() {
    setBusy(true);
    setError(null);
    try {
      const err = await signIn();
      if (err) setError(MESSAGES[err]);
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? notice;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, padding: 24, justifyContent: "space-between" }}>
      <View style={{ flex: 1, justifyContent: "center", gap: 20 }}>
        <BrandMark />
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, color: colors.ink }}>{BRAND_NAME}</Text>
        <Text style={{ fontSize: 18, color: colors.inkSoft }}>{BRAND_TAGLINE}</Text>
      </View>
      <View style={{ gap: 12 }}>
        {message ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, textAlign: "center" }}>{message}</Text>
        ) : null}
        <Button label="Entrar com Google" loading={busy} onPress={onPress} />
      </View>
    </SafeAreaView>
  );
}
```

- [ ] Run: `bun run typecheck && bun run lint` — expect exit 0 (the `(tabs)` typed-route warning
  is resolved by Task 10; if `typedRoutes` errors on the missing route, run Task 10 before this
  check).
- [ ] `git commit -m "feat: add root layout with auth guard and login screen"`

---

### Task 10 — Tab bar, Mais stack and placeholders

**Files:** `src/app/(tabs)/_layout.tsx` (new), `src/app/(tabs)/painel.tsx` (new), `src/app/(tabs)/contas.tsx` (new), `src/app/(tabs)/grupos.tsx` (new), `src/app/(tabs)/recorrentes.tsx` (new), `src/app/(tabs)/mais/_layout.tsx` (new), `src/app/(tabs)/mais/index.tsx` (new), `src/app/(tabs)/mais/categorias.tsx` (new), `src/app/(tabs)/mais/relatorios.tsx` (new), `src/ui/Placeholder.tsx` (new)
**Needs context from:** Task 4 — `useTheme`, `fonts`, `radii`

- [ ] Create `src/ui/Placeholder.tsx` (R17):

```tsx
import { Text, View } from "react-native";
import { fonts } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export function Placeholder({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ink }}>{title}</Text>
      <Text style={{ color: colors.inkSoft, fontSize: 16 }}>Em breve por aqui.</Text>
    </View>
  );
}
```

- [ ] Create `src/app/(tabs)/_layout.tsx` (R15):

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useTheme } from "../../theme/ThemeProvider";

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => (
  <Ionicons name={name} color={color} size={size} />
);

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.hair },
      }}
    >
      <Tabs.Screen name="painel" options={{ title: "Painel", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="contas" options={{ title: "Contas", tabBarIcon: icon("receipt-outline") }} />
      <Tabs.Screen name="grupos" options={{ title: "Grupos", tabBarIcon: icon("albums-outline") }} />
      <Tabs.Screen name="recorrentes" options={{ title: "Recorrentes", tabBarIcon: icon("repeat-outline") }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
```

- [ ] Create the four tab screens, each a one-liner on `Placeholder`, e.g. `src/app/(tabs)/painel.tsx`:

```tsx
import { Placeholder } from "../../ui/Placeholder";
export default function Painel() {
  return <Placeholder title="Painel" />;
}
```

  Same for `contas.tsx` ("Contas"), `grupos.tsx` ("Grupos"), `recorrentes.tsx` ("Recorrentes").
- [ ] Create `src/app/(tabs)/mais/_layout.tsx`:

```tsx
import { Stack } from "expo-router";
import { useTheme } from "../../../theme/ThemeProvider";

export default function MaisLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.panel },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mais" }} />
      <Stack.Screen name="categorias" options={{ title: "Categorias" }} />
      <Stack.Screen name="relatorios" options={{ title: "Relatórios" }} />
      <Stack.Screen name="ajustes" options={{ title: "Ajustes" }} />
    </Stack>
  );
}
```

- [ ] Create `src/app/(tabs)/mais/index.tsx` (R16):

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";

const ITEMS = [
  { href: "/mais/categorias", label: "Categorias", icon: "pricetags-outline" },
  { href: "/mais/relatorios", label: "Relatórios", icon: "bar-chart-outline" },
  { href: "/mais/ajustes", label: "Ajustes", icon: "settings-outline" },
] as const;

export default function Mais() {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 16, gap: 8 }}>
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={item.label}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 12, padding: 16,
              borderRadius: 18, backgroundColor: pressed ? colors.hair : colors.card,
            })}
          >
            <Ionicons name={item.icon} size={22} color={colors.inkSoft} />
            <Text style={{ flex: 1, fontSize: 17, color: colors.ink }}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
```

- [ ] Create `src/app/(tabs)/mais/categorias.tsx` and `relatorios.tsx` on `Placeholder`
  ("Categorias", "Relatórios"), same shape as `painel.tsx` with `../../../ui/Placeholder`.
- [ ] Run: `bun run typecheck && bun run lint` — expect exit 0 (`ajustes` route is added in Task 11;
  if typed routes complain about `/mais/ajustes`, run Task 11 before this check).
- [ ] `git commit -m "feat: add tab bar, mais stack and section placeholders"`

---

### Task 11 — Ajustes: perfil, sair e aparência

**Files:** `src/app/(tabs)/mais/ajustes.tsx` (new), `src/ui/Avatar.tsx` (new), `src/ui/ThemeSegmented.tsx` (new)
**Needs context from:** Task 5 — `initials`, `displayName`; Task 8 — `useAuth().session.profile`, `signOut`; Task 4 — `useTheme().preference/setPreference`; Task 9 — `Button`

- [ ] Create `src/ui/Avatar.tsx` (R18 — initials when missing or on load error):

```tsx
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { initials } from "../auth/session";
import { useTheme } from "../theme/ThemeProvider";

export function Avatar({ name, uri, size = 54 }: { name: string; uri: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image accessibilityIgnoresInvertColors source={{ uri }} style={box} onError={() => setFailed(true)} />;
  }
  return (
    <View style={{ ...box, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}
```

- [ ] Create `src/ui/ThemeSegmented.tsx` (R20):

```tsx
import { Pressable, Text, View } from "react-native";
import type { ThemePreference } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

export function ThemeSegmented() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 4 }}>
      {OPTIONS.map((o) => {
        const selected = o.value === preference;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => setPreference(o.value)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center", backgroundColor: selected ? colors.panel : "transparent" }}
          >
            <Text style={{ color: selected ? colors.ink : colors.inkSoft, fontWeight: selected ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] Create `src/app/(tabs)/mais/ajustes.tsx` (R18–R20):

```tsx
import { Alert, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import { displayName } from "../../../auth/session";
import { fonts } from "../../../theme/tokens";
import { useTheme } from "../../../theme/ThemeProvider";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { ThemeSegmented } from "../../../ui/ThemeSegmented";

export default function Ajustes() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const profile = session?.profile ?? { name: "", email: "", picture: null };
  const name = displayName(profile);

  function confirmSignOut() {
    Alert.alert(
      "Sair da conta?",
      "Você precisará entrar novamente para acessar suas contas.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sair", style: "destructive", onPress: () => void signOut() },
      ]
    );
  }

  const section = { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 12 };
  const heading = { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>Perfil</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={name} uri={profile.picture} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>{name}</Text>
            {profile.email ? <Text style={{ color: colors.inkSoft }}>{profile.email}</Text> : null}
          </View>
        </View>
        <Button label="Sair" variant="danger" onPress={confirmSignOut} />
      </View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>Aparência</Text>
        <ThemeSegmented />
      </View>
    </ScrollView>
  );
}
```

- [ ] Run: `bun run typecheck && bun run lint && bun run test` — expect pass.
- [ ] `git commit -m "feat: add ajustes with profile, sign-out and appearance"`

---

### Task 12 — Repo docs: CLAUDE.md and README

**Files:** `CLAUDE.md` (new), `README.md` (new), `docs/04-phased-plan.md` (modified)

- [ ] Create `CLAUDE.md` (English) covering: what the app is (iOS-first Expo client, parity with
  the web, provisional name in `src/config/brand.ts`); architecture (talks only to the web BFF via
  `src/api/client.ts` with a mobile bearer; auth flow Google → `POST /api/auth/mobile` → Keychain;
  renewal policy; never embed secrets); layout (`src/app` routes, `src/auth`, `src/api`,
  `src/theme`, `src/ui`, `docs/`, `.sdd/`); scripts (`bunx expo run:ios`, `bun run test`,
  `bun run typecheck`, `bun run lint`, `eas build -p ios --profile production`,
  `eas submit -p ios`); env (`.env.example`, `APP_ENV`); workflow (spec → plan → execute, commits
  direct to `main`, Conventional Commits, never `git push`); language rule (code/docs English,
  UI copy pt-BR).
- [ ] Create `README.md`: one paragraph + prerequisites (Xcode 26.4+, Bun, `.env` from
  `.env.example`, web BFF running on `localhost:3000`) + `bun install && bunx expo run:ios`.
- [ ] In `docs/04-phased-plan.md`, mark D3 as decided: "iOS 17+ (2026-10-04)".
- [ ] `git commit -m "docs: add CLAUDE.md and README for the app repo"`

---

### Task 13 — End-to-end verification (manual checklist)

**Files:** none
**Needs context from:** web plan Tasks 3–5 — `/api/auth/mobile` and bearer acceptance running locally

- [ ] Run: `bun run typecheck && bun run lint && bun run test` — expect all pass.
- [ ] Start the web BFF (`cd ../financial-consultant-web && bun run dev`, with
  `MOBILE_OAUTH_CLIENT_IDS` set) and the app: `bunx expo run:ios`.
- [ ] Check on the Simulator, ticking each:
  - R1/R3: fresh install opens on the login screen; no other signed-out screen exists.
  - R4: brand mark, "Financial Consultant", tagline, one "Entrar com Google" button; switch the
    Simulator to dark appearance → `canvas` dark.
  - R6: start sign-in and cancel → back on login, no error.
  - R8: tap the button twice quickly → only one Google sheet.
  - R5/R13/R14: sign in with an account that uses the web → lands on Painel; the BFF terminal
    shows `"channel":"mobile","path":"me"`; the `user_id` (log it temporarily or read it from the
    BFF log) equals the web's `/api/v1/me` for the same account.
  - R7: stop the BFF, tap sign in → network message; restart it.
  - R2: kill and relaunch the app → straight to Painel.
  - R10: edit the stored `expiresAt` to 1 hour ahead (temporary dev-only code calling
    `saveSession`), relaunch → the BFF log shows a new `/api/auth/mobile` call; no login screen.
  - R11: restart the BFF with a different `SESSION_SECRET` → next request 401 → app renews
    silently and continues. Then set `MOBILE_OAUTH_CLIENT_IDS=wrong` and restart → next 401 leads
    to the login screen with "Sua sessão expirou. Entre novamente para continuar."
  - R12: with a near-expiry session, enable airplane mode (Simulator: disable Mac network),
    foreground the app → still signed in; restore network → renewal happens.
  - R15/R16/R17: five tabs in order; each tab keeps its own stack; Mais lists three items;
    placeholders read "Em breve por aqui.".
  - R18: Ajustes shows avatar, name, email; with the picture URL broken (temporary), initials show.
  - R19: Sair → "Sair da conta?" → Cancelar does nothing; Sair → login screen; sign in again →
    Google account chooser appears; sign in with a different account → no trace of the previous one.
  - R20: Claro/Escuro/Sistema apply instantly (including login after sign-out) and persist after
    relaunch; Sistema follows the Simulator's appearance toggle live.
  - R21/R23: colours match `docs/03-design-system.md`; largest Dynamic Type size keeps text
    readable; VoiceOver reads button labels; Reduce Motion causes no unexpected animation.
  - R9/R26: `grep -r "WEB_API_SECRET\|SESSION_SECRET" src app.config.ts` → no matches; the session
    is only written through `expo-secure-store`.
- [ ] Production / TestFlight (R25, developer-owned accounts): Apple Developer Program active,
  `eas login`, set `PROD_BFF_URL`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME` as EAS
  environment variables for `production`, set `_MOBILE_OAUTH_CLIENT_IDS` on the web's Cloud Build
  trigger and deploy the web, then:
  Run: `eas build -p ios --profile production && eas submit -p ios --latest`
  → build appears in TestFlight; install on a device and repeat R5 and R19 against production.
- [ ] Remove every temporary dev-only change made during this checklist (none may be committed).

---

## Self-review

**Spec coverage:**
- R1, R2, R3 — Task 9 (`Stack.Protected` with only `login` when signed out) + Task 8 launch flow.
- R4 — Task 9 (`login.tsx`, `BrandMark`, `canvas` background).
- R5 — Task 8 `signIn` → `adopt`; Task 9 routes to `(tabs)`.
- R6 — Task 6 (`cancelled`) + Task 8 (returns `null`, no message).
- R7 — Task 6 (`ExchangeOutcome` kinds) + Task 9 (distinct pt-BR messages, network vs rejected).
- R8 — Task 9 (`Button` `loading` disables).
- R9 — Task 6 (`session-store.ts`, Keychain only).
- R10 — Task 5 (`needsRenewal`, 24 h) + Task 8 (launch and foreground renewal).
- R11 — Task 7 (one renewal, one retry, `onExpired`) + Task 8 (notice copy).
- R12 — Task 7 (`NetworkError` never signs out) + Task 8 (`deferred`, NetInfo reconnect).
- R13, R14 — Task 8 (`loadIdentity` → `/me`) + Task 13 check.
- R15, R16, R17 — Task 10.
- R18, R19, R20 — Task 11 (+ Task 6 `googleSignOut`, Task 4 persistence).
- R21, R22 — Task 4 tokens, Task 2 `brand.ts`.
- R23 — accessibility props in Tasks 9–11 + Task 13 check.
- R24, R25 — Task 2 (`APP_ENV`, `bffUrl`, `eas.json`) + Task 13.
- R26 — Task 2 (`.env.example` public IDs only) + Task 13 grep.
- Edge cases: gateway off → 401 → `rejected` (Task 6/9); BFF 503 → `unavailable` (Task 6; Task 8 treats it as `deferred`); revoked Google access → `no_credential` → `failed` → sign-out (Task 8); different account after sign-out → Task 8 clears state + Google sign-out, checked in Task 13; app killed mid sign-in → nothing saved before `adopt` (Task 8); theme change on login → Task 4/9.
- Success criteria → Task 13.

**Placeholder scan:** none found. The Task 6 spike has a defined pass condition and a defined fallback.

**Type/contract consistency:** `StoredSession` (Task 5) matches the BFF exchange body from the web
plan (`token`, `expiresAt` ISO string, `profile{name,email,picture|null}`). Task 8 calls Task 6's
`signInInteractive`/`freshIdTokenSilently`/`googleSignOut`/`exchangeIdToken`/`loadSession`/
`saveSession`/`clearSession` and Task 7's `installAuthHooks`/`apiFetch` with the signatures defined
there. Task 9 consumes `SignInError` exactly as exported by Task 8. Task 11 uses `initials`/
`displayName` (Task 5), `useAuth().session.profile`/`signOut` (Task 8), `preference`/`setPreference`
(Task 4), and `Button` (Task 9).

**Task sizing:** Task 10 creates 10 files, but eight are one-line placeholder routes in one
navigation concern — splitting would only add ceremony. Task 2 touches 6 files, all app-config
plumbing that must land together for `expo config` to resolve. Task 8 is one file but the most
logic-dense; it is kept whole because launch, foreground, reconnect and 401 renewal share the
same single-flight state.
