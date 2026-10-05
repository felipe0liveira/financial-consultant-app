import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, useReducedMotion } from "react-native-reanimated";
import { formatBRL } from "../../domain/format";
import { fonts, radii } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { monthName, monthResultLine, type NextMonthPreview, type SettledSummary } from "./settled";

const plural = (n: number) => (n === 1 ? "conta" : "contas");

/**
 * Replaces the three KPI cards while every expense of the month is paid (spec 1, 4–9).
 * `preview` is null while the next month is loading or failed: the line is hidden.
 */
export function SettledCard({ month, summary, preview, onOpenNextMonth }: {
  month: string;
  summary: SettledSummary;
  preview: NextMonthPreview | null;
  onOpenNextMonth: (month: string) => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const result = monthResultLine(summary.result);

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(550)}
      style={{ backgroundColor: colors.okBg, borderRadius: radii.card, padding: 18, gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="checkmark-circle" size={26} color={colors.ok} />
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ok }}>
          {monthName(month)} quitado
        </Text>
      </View>
      <Text style={{ fontSize: 15, color: colors.ok }}>
        {formatBRL(summary.paidAmount)} pagos · {summary.paidCount} {plural(summary.paidCount)}
      </Text>
      <Text style={{ fontSize: 16, color: result.negative ? colors.danger : colors.ink }}>
        {result.label}: <Text style={{ fontWeight: "700" }}>{formatBRL(result.amount)}</Text>
      </Text>
      {summary.pendingIncome > 0 ? (
        <Text style={{ fontSize: 14, color: colors.inkSoft }}>Ainda falta receber {formatBRL(summary.pendingIncome)}</Text>
      ) : null}
      {preview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Abre as contas do próximo mês"
          onPress={() => onOpenNextMonth(preview.month)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 10,
            borderTopWidth: 1, borderTopColor: colors.hair, opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ flex: 1, fontSize: 14, color: colors.inkSoft }}>
            <Text style={{ fontWeight: "700", color: colors.ink }}>{monthName(preview.month)}:</Text>{" "}
            {preview.next
              ? `${formatBRL(preview.toPay)} a pagar · próxima: ${preview.next.description}, ${preview.next.when}`
              : "nada a pagar por enquanto"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
