import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, useReducedMotion } from "react-native-reanimated";
import { formatBRL, formatPct } from "../../domain/format";
import { fonts, radii } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { CountUpText } from "../../ui/CountUpText";
import { FlipCard } from "../../ui/FlipCard";
import type { PainelKpis } from "./derive";

function Face({ bg, children }: { bg: string; children: ReactNode }) {
  return <View style={{ backgroundColor: bg, borderRadius: radii.card, padding: 18, gap: 6, flex: 1 }}>{children}</View>;
}

const pctOf = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export function KpiCards({ kpis }: { kpis: PainelKpis }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const enter = (i: number) => (reduced ? undefined : FadeInUp.delay(i * 80).duration(550));

  const label = (text: string, color: string) => <Text style={{ fontSize: 14, color }}>{text}</Text>;
  const value = (n: number, color: string) => (
    <CountUpText value={n} format={formatBRL} style={{ fontFamily: fonts.display, fontSize: 30, color }} />
  );
  const sub = (text: string, color: string) => <Text style={{ fontSize: 13, color }}>{text}</Text>;

  const paidPct = pctOf(kpis.paidAmount, kpis.totalExpenses);
  const unpaidPct = pctOf(kpis.unpaidAmount, kpis.totalExpenses);

  return (
    <View style={{ gap: 12 }}>
      <Animated.View entering={enter(0)}>
        <Face bg={colors.accent}>
          {label("Total do mês", "#FFFFFF")}
          {value(kpis.totalExpenses, "#FFFFFF")}
          {sub(`${kpis.totalBills} contas no total`, "#FFFFFF")}
        </Face>
      </Animated.View>
      <Animated.View entering={enter(1)}>
        <FlipCard
          label="Pago"
          front={
            <Face bg={colors.okBg}>
              {label("Pago", colors.ok)}
              {value(kpis.paidAmount, colors.ok)}
              {sub(`${kpis.paidBills} de ${kpis.totalBills} contas`, colors.ok)}
            </Face>
          }
          back={
            <Face bg={colors.okBg}>
              {label("Pago", colors.ok)}
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ok }}>{formatPct(paidPct)}</Text>
              {sub("do total do mês", colors.ok)}
            </Face>
          }
        />
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <FlipCard
          label="A pagar"
          front={
            <Face bg={colors.warnBg}>
              {label("A pagar", colors.warn)}
              {value(kpis.unpaidAmount, colors.warn)}
              {sub(kpis.overdueAmount > 0 ? `${formatBRL(kpis.overdueAmount)} em atraso` : "Em dia", colors.warn)}
            </Face>
          }
          back={
            <Face bg={colors.warnBg}>
              {label("A pagar", colors.warn)}
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.warn }}>{formatPct(unpaidPct)}</Text>
              {sub("do total do mês", colors.warn)}
            </Face>
          }
        />
      </Animated.View>
    </View>
  );
}
