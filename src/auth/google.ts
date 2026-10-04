import {
  GoogleSignin,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
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
    if (isNoSavedCredentialFoundResponse(res)) return { kind: "no_credential" };
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
