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
