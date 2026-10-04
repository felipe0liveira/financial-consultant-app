import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { categoryColors } from "../../domain/bills";
import { useTheme } from "../../theme/ThemeProvider";

type IconName = keyof typeof Ionicons.glyphMap;
function iconFor(category: string): IconName {
  const k = category.toLowerCase();
  if (k.includes("moradia") || k.includes("aluguel")) return "home-outline";
  if (k.includes("energia")) return "flash-outline";
  if (k.includes("conta") || k.includes("internet") || k.includes("água") || k.includes("agua")) return "wifi-outline";
  if (k.includes("lazer") || k.includes("academia") || k.includes("streaming")) return "barbell-outline";
  if (k.includes("transporte") || k.includes("carro") || k.includes("uber")) return "car-outline";
  return "pricetag-outline";
}

export function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  const { colors } = useTheme();
  const c = categoryColors(category);
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors[c.bg], alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={iconFor(category)} size={size * 0.5} color={colors[c.text]} />
    </View>
  );
}
