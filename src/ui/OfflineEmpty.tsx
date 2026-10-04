import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";

export function OfflineEmpty({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12, padding: 32 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.ink }}>Sem conexão</Text>
      <Text style={{ color: colors.inkSoft, textAlign: "center" }}>Verifique sua conexão com a internet e tente novamente.</Text>
      <Button label="Tentar novamente" variant="secondary" onPress={onRetry} />
    </View>
  );
}
