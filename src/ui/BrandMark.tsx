import { Text, View } from "react-native";
import { BRAND_NAME } from "../config/brand";
import { fonts } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

export function BrandMark({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={BRAND_NAME}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: size * 0.5 }}>{BRAND_NAME[0]}</Text>
    </View>
  );
}
