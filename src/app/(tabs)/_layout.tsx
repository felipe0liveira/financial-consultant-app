import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={color} size={size} />;
  }
  return TabIcon;
};

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.hair },
      }}
    >
      <Tabs.Screen name="painel" options={{ title: "Painel", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="contas" options={{ title: "Contas", tabBarIcon: icon("receipt-outline") }} />
      <Tabs.Screen name="grupos" options={{ title: "Grupos", tabBarIcon: icon("albums-outline") }} />
      <Tabs.Screen name="recorrentes" options={{ title: "Recorrentes", tabBarIcon: icon("repeat-outline") }} />
      <Tabs.Screen name="mais" options={{ title: "Mais", tabBarIcon: icon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
