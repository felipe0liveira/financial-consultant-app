import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../../theme/ThemeProvider";

const ITEMS = [
  { href: "/mais/categorias", label: "Categorias", icon: "pricetags-outline" },
  { href: "/mais/relatorios", label: "Relatórios", icon: "bar-chart-outline" },
  { href: "/mais/ajustes", label: "Ajustes", icon: "settings-outline" },
] as const;

export default function Mais() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ padding: 16, gap: 8 }}>
      {ITEMS.map((item) => (
        // A plain Pressable + router.push: wrapping it in <Link asChild> drops the
        // function-form `style` Pressable needs for its pressed state.
        <Pressable
          key={item.href}
          accessibilityRole="link"
          accessibilityLabel={item.label}
          onPress={() => router.push(item.href)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: 12, padding: 16,
            borderRadius: 18, backgroundColor: pressed ? colors.hair : colors.card,
          })}
        >
          <Ionicons name={item.icon} size={22} color={colors.inkSoft} />
          <Text style={{ flex: 1, fontSize: 17, color: colors.ink }}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </Pressable>
      ))}
    </View>
  );
}
