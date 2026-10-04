import { Pressable, Text, View } from "react-native";
import type { ThemePreference } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

export function ThemeSegmented() {
  const { colors, preference, setPreference } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 4 }}>
      {OPTIONS.map((o) => {
        const selected = o.value === preference;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => setPreference(o.value)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center", backgroundColor: selected ? colors.panel : "transparent" }}
          >
            <Text style={{ color: selected ? colors.ink : colors.inkSoft, fontWeight: selected ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
