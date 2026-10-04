import { ActivityIndicator, Text, View } from "react-native";
import { useRefreshNotice } from "../hooks/status";
import { useTheme } from "../theme/ThemeProvider";

export function RefreshNotice({ isFetching, hasData }: { isFetching: boolean; hasData: boolean }) {
  const show = useRefreshNotice(isFetching, hasData);
  const { colors } = useTheme();
  if (!show) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", paddingVertical: 4 }}>
      <ActivityIndicator size="small" color={colors.inkSoft} />
      <Text style={{ color: colors.inkSoft, fontSize: 13 }}>Atualizando dados…</Text>
    </View>
  );
}
