import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { addMonths, formatMonthLong } from "../../domain/format";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";

interface Props {
  month: string;
  onChange: (month: string) => void;
}

export function MonthStepper({ month, onChange }: Props) {
  const { colors } = useTheme();
  const btn = { padding: 10, borderRadius: 12, backgroundColor: colors.card } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={8} onPress={() => onChange(addMonths(month, -1))} style={btn}>
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
      </Pressable>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>
        {formatMonthLong(month)}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={8} onPress={() => onChange(addMonths(month, 1))} style={btn}>
        <Ionicons name="chevron-forward" size={20} color={colors.ink} />
      </Pressable>
    </View>
  );
}
