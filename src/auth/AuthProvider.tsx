import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import {
  createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { apiFetch, installAuthHooks, type RenewOutcome } from "../api/client";
import { clearQueryCache } from "../query/client";
import { exchangeIdToken } from "./exchange";
import { freshIdTokenSilently, googleSignOut, signInInteractive } from "./google";
import { needsRenewal, type StoredSession } from "./session";
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
const CACHE_OWNER_KEY = "fc-cache-owner";
const EXPIRED_NOTICE = "Sua sessão expirou. Entre novamente para continuar.";

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const renewing = useRef<Promise<RenewResult> | null>(null);
  const pendingRenewal = useRef(false);
  /** Bumped on every local sign-out so an in-flight renewal cannot resurrect a signed-out session. */
  const generation = useRef(0);
  const identityInFlight = useRef<Promise<void> | null>(null);

  /** Persists and activates a session. Returns false (and leaves nothing stored) if a sign-out raced it. */
  const adopt = useCallback(async (s: StoredSession, gen: number): Promise<boolean> => {
    await saveSession(s);
    if (gen !== generation.current) {
      await clearSession().catch(() => {});
      return false;
    }
    sessionRef.current = s;
    setSession(s);
    setStatus("signedIn");
    return true;
  }, []);

  const signOutLocal = useCallback(async (withNotice: string | null) => {
    generation.current += 1;
    pendingRenewal.current = false;
    sessionRef.current = null;
    setSession(null);
    setUserId(null);
    setNotice(withNotice);
    setStatus("signedOut");
    await clearQueryCache().catch(() => {});
    await AsyncStorage.removeItem(CACHE_OWNER_KEY).catch(() => {});
    await clearSession().catch(() => {});
    await googleSignOut().catch(() => {});
  }, []);

  /**
   * Single-flight silent renewal. Network/unavailable/unexpected errors → "deferred" (never
   * signs out, R12). "failed" is definitive (Google access revoked, BFF rejected the exchange).
   */
  const renew = useCallback((): Promise<RenewResult> => {
    if (renewing.current) return renewing.current;
    renewing.current = (async (): Promise<RenewResult> => {
      const gen = generation.current;
      try {
        const google = await freshIdTokenSilently();
        if (gen !== generation.current) return "deferred"; // signed out meanwhile
        if (google.kind === "error") { pendingRenewal.current = true; return "deferred"; }
        if (google.kind !== "ok") return "failed";
        const out = await exchangeIdToken(google.idToken);
        if (gen !== generation.current) return "deferred"; // signed out meanwhile
        if (out.kind === "network" || out.kind === "unavailable") { pendingRenewal.current = true; return "deferred"; }
        if (out.kind !== "ok") return "failed";
        if (!(await adopt(out.session, gen))) return "deferred";
        pendingRenewal.current = false;
        return "renewed";
      } catch {
        pendingRenewal.current = true;
        return "deferred";
      }
    })().finally(() => { renewing.current = null; });
    return renewing.current;
  }, [adopt]);

  /** Fetches the identity; a no-op without a session (never sends an unauthenticated /me). */
  const loadIdentity = useCallback((): Promise<void> => {
    if (!sessionRef.current) return Promise.resolve();
    if (identityInFlight.current) return identityInFlight.current;
    const gen = generation.current;
    identityInFlight.current = (async () => {
      try {
        const me = await apiFetch<{ user_id: string }>("me");
        if (gen !== generation.current) return;
        const owner = await AsyncStorage.getItem(CACHE_OWNER_KEY).catch(() => null);
        if (owner && owner !== me.user_id) await clearQueryCache().catch(() => {});
        await AsyncStorage.setItem(CACHE_OWNER_KEY, me.user_id).catch(() => {});
        if (gen !== generation.current) return;
        setUserId(me.user_id);
      } catch {
        // Offline or transient: identity is re-fetched on the next foreground.
      } finally {
        identityInFlight.current = null;
      }
    })();
    return identityInFlight.current;
  }, []);

  /** Renew if due (R10). A definitively failed renewal signs out; a deferred one never does. */
  const renewIfDue = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !needsRenewal(s)) return;
    const gen = generation.current;
    const r = await renew();
    if (r === "failed" && gen === generation.current) await signOutLocal(EXPIRED_NOTICE);
  }, [renew, signOutLocal]);

  // Install client hooks once.
  useEffect(() => {
    installAuthHooks({
      getToken: () => sessionRef.current?.token ?? null,
      renew: async (): Promise<RenewOutcome> => {
        const r = await renew();
        const token = sessionRef.current?.token;
        if (r === "renewed" && token) return { kind: "renewed", token };
        return r === "failed" ? { kind: "failed" } : { kind: "deferred" };
      },
      onExpired: () => { void signOutLocal(EXPIRED_NOTICE); },
    });
    return () => installAuthHooks(null);
  }, [renew, signOutLocal]);

  // Launch (R1, R2, R10). Always ends in a defined state, never stuck in "loading".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadSession();
        if (cancelled) return;
        if (!stored) { setStatus("signedOut"); return; }
        const gen = generation.current;
        sessionRef.current = stored;
        setSession(stored);
        if (needsRenewal(stored)) {
          const r = await renew();
          if (cancelled) return;
          // A definitive failure signs out; a deferred renewal (offline/unavailable) keeps the
          // session even if expired (R12) — the first authenticated request or reconnect retries.
          if (r === "failed" && gen === generation.current) {
            await signOutLocal(EXPIRED_NOTICE);
            return;
          }
        }
        if (!sessionRef.current) return; // signed out meanwhile
        setStatus("signedIn");
        void loadIdentity();
      } catch {
        if (cancelled) return;
        setStatus(sessionRef.current ? "signedIn" : "signedOut");
      }
    })();
    return () => { cancelled = true; };
  }, [renew, signOutLocal, loadIdentity]);

  // Foreground (R10) and reconnect (R12). All handlers are no-ops until a session exists.
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void renewIfDue().then(() => loadIdentity());
    });
    const net = NetInfo.addEventListener((s) => {
      if (!s.isConnected) return;
      void (async () => {
        if (pendingRenewal.current) await renewIfDue();
        if (!userId) await loadIdentity();
      })();
    });
    return () => { app.remove(); net(); };
  }, [renewIfDue, loadIdentity, userId]);

  const signIn = useCallback(async (): Promise<SignInError | null> => {
    setNotice(null);
    const gen = generation.current;
    const google = await signInInteractive();
    if (google.kind === "cancelled" || google.kind === "no_credential") return null; // R6
    if (google.kind === "error") return "google";
    const out = await exchangeIdToken(google.idToken);
    if (out.kind !== "ok") return out.kind; // R7
    try {
      if (!(await adopt(out.session, gen))) return null; // signed out meanwhile
    } catch {
      return "google"; // could not persist the session
    }
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
