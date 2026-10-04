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
    icon: "./assets/expo.icon",
    bundleIdentifier: "com.felipeoliveira.financialconsultant",
    deploymentTarget: "17.0",
    supportsTablet: false,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    // enableSceneSupport: the iOS 27 SDK (Xcode 27) requires the UIScene life cycle;
    // SDK 57 opts in here. Remove once on Expo SDK 58+, which adopts it by default.
    ["expo-build-properties", { ios: { enableSceneSupport: true } }],
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
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    appEnv: APP_ENV,
    bffUrl,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    googleServerClientId: process.env.GOOGLE_SERVER_CLIENT_ID || undefined,
  },
};

export default config;
