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
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, color: colors.ink }}>
          {BRAND_NAME}
        </Text>
        <Text style={{ fontSize: 18, color: colors.inkSoft }}>{BRAND_TAGLINE}</Text>
      </View>
      <View style={{ gap: 12 }}>
        {message ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, textAlign: "center" }}>
            {message}
          </Text>
        ) : null}
        <Button label="Entrar com Google" loading={busy} onPress={onPress} />
      </View>
    </SafeAreaView>
  );
}
