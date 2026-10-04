import { Text, View } from "react-native";
import { useOnline } from "../hooks/status";
import { useTheme } from "../theme/ThemeProvider";

export function OfflineBanner({ forceVisible }: { forceVisible?: boolean } = {}) {
  const online = useOnline();
  const { colors } = useTheme();
  if (online && !forceVisible) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.warnBg, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12 }}>
      <Text style={{ color: colors.warn, fontSize: 14 }}>Sem conexão · mostrando os últimos dados salvos</Text>
    </View>
  );
}
