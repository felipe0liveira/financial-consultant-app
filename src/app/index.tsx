import { Redirect } from "expo-router";
import { useAuth } from "../auth/AuthProvider";

/**
 * Entry route ("/"). The app always opens here; send the user to the login
 * screen or to Painel depending on the session (spec R1, R2).
 */
export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === "signedIn" ? "/painel" : "/login"} />;
}
