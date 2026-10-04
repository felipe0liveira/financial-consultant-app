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
  /** Bumped on every local sign-out so an in-flight renewal cannot resurrect a signed-out session. */
  const generation = useRef(0);

  const adopt = useCallback(async (s: StoredSession) => {
    await saveSession(s);
    sessionRef.current = s;
    setSession(s);
    setStatus("signedIn");
  }, []);

  const signOutLocal = useCallback(async (withNotice: string | null) => {
    generation.current += 1;
    pendingRenewal.current = false;
    sessionRef.current = null;
    setSession(null);
    setUserId(null);
    setNotice(withNotice);
    setStatus("signedOut");
    await clearSession().catch(() => {});
    await googleSignOut().catch(() => {});
  }, []);

  /** Single-flight silent renewal. Network/unavailable → "deferred" (never signs out, R12). */
  const renew = useCallback((): Promise<RenewResult> => {
    if (renewing.current) return renewing.current;
    renewing.current = (async (): Promise<RenewResult> => {
      const gen = generation.current;
      const google = await freshIdTokenSilently();
      if (google.kind === "error") { pendingRenewal.current = true; return "deferred"; }
      if (google.kind !== "ok") return "failed";
      const out = await exchangeIdToken(google.idToken);
      if (gen !== generation.current) return "failed"; // signed out meanwhile
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
        // Only a definitive failure on an already-expired session signs out. A deferred
        // renewal (offline/unavailable) keeps the session even if expired (R12); the first
        // authenticated request or the reconnect retry resolves it.
        if (r === "failed" && isExpired(stored)) {
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
      if (!s.isConnected) return;
      if (pendingRenewal.current) void renewIfDue();
      if (!userId) void loadIdentity();
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
