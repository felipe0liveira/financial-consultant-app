import { Text, View } from "react-native";
import { fonts } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export function Placeholder({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ink }}>{title}</Text>
      <Text style={{ color: colors.inkSoft, fontSize: 16 }}>Em breve por aqui.</Text>
    </View>
  );
}
