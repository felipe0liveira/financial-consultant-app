import { ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { ContasKpis as ContasKpisData } from "../../domain/bills";
import { formatBRL, formatPct } from "../../domain/format";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { CountUpText } from "../../ui/CountUpText";
import { FlipCard } from "../../ui/FlipCard";

const CARD_WIDTH = 160;

/** Contas KPI strip (spec C2): due today, receivable/received, payable/paid, free balance. */
export function ContasKpis({ kpis }: { kpis: ContasKpisData }) {
  const { colors } = useTheme();

  const card: ViewStyle = { width: CARD_WIDTH, borderRadius: 16, padding: 14, gap: 4, backgroundColor: colors.card };
  const label: TextStyle = { fontSize: 12, color: colors.inkSoft };
  const value: TextStyle = { fontFamily: fonts.display, fontSize: 22, color: colors.ink };

  const face = (title: string, amount: number, format: (n: number) => string, valueColor?: string, subtitle?: string) => (
    <View style={card}>
      <Text style={label}>{title}</Text>
      <CountUpText value={amount} format={format} style={valueColor ? { ...value, color: valueColor } : value} />
      {subtitle ? <Text style={{ fontSize: 12, color: colors.inkFaint }}>{subtitle}</Text> : null}
    </View>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {kpis.dueToday > 0 ? (
        <View style={{ ...card, backgroundColor: colors.warnBg }}>
          <Text style={{ ...label, color: colors.warn }}>Vence hoje</Text>
          <CountUpText value={kpis.dueToday} format={formatBRL} style={{ ...value, color: colors.warn }} />
          <Text style={{ fontSize: 12, color: colors.warn }}>Não deixe vencer</Text>
        </View>
      ) : null}
      <FlipCard
        label="A receber e recebido"
        initialBack={kpis.aReceber === 0 && kpis.recebido > 0}
        front={face("A receber", kpis.aReceber, formatBRL)}
        back={face("Recebido", kpis.recebido, formatBRL)}
      />
      <FlipCard
        label="A pagar e pago"
        initialBack={kpis.aPagar === 0 && kpis.pago > 0}
        front={face("A pagar", kpis.aPagar, formatBRL)}
        back={face("Pago", kpis.pago, formatBRL)}
      />
      <FlipCard
        label="Saldo livre e percentual da entrada"
        front={face("Saldo livre", kpis.saldoLivre, formatBRL, kpis.saldoLivre >= 0 ? colors.ok : colors.danger)}
        back={face(
          "% da entrada",
          kpis.saldoLivrePct ?? 0,
          (n) => (kpis.saldoLivrePct === null ? "—" : formatPct(n)),
          kpis.saldoLivre >= 0 ? colors.ok : colors.danger
        )}
      />
    </ScrollView>
  );
}
