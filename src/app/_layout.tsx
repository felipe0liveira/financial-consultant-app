import { Bitter_400Regular, Bitter_600SemiBold, Bitter_700Bold, useFonts } from "@expo-google-fonts/bitter";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "../auth/AuthProvider";
import { QueryProvider } from "../query/QueryProvider";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";
import { ToastProvider } from "../ui/toast/ToastProvider";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  const { scheme, colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Bitter_400Regular, Bitter_600SemiBold, Bitter_700Bold });
  // On a font error, fall back silently to the system font instead of blocking the app forever.
  const ready = status !== "loading" && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  const signedIn = status === "signedIn";
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="bill-details"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: "fitToContents",
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: colors.panel },
            }}
          />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
