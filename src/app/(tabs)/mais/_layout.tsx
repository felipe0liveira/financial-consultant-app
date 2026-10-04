import { Stack } from "expo-router";
import { useTheme } from "../../../theme/ThemeProvider";

export default function MaisLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.ink,
        contentStyle: { backgroundColor: colors.panel },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Mais" }} />
      <Stack.Screen name="categorias" options={{ title: "Categorias" }} />
      <Stack.Screen name="relatorios" options={{ title: "Relatórios" }} />
      <Stack.Screen name="ajustes" options={{ title: "Ajustes" }} />
    </Stack>
  );
}
