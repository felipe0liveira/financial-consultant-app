import { useState } from "react";
import { Image, Text, View } from "react-native";
import { initials } from "../auth/session";
import { useTheme } from "../theme/ThemeProvider";

export function Avatar({ name, uri, size = 54 }: { name: string; uri: string | null; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image accessibilityIgnoresInvertColors source={{ uri }} style={box} onError={() => setFailed(true)} />;
  }
  return (
    <View style={{ ...box, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}
