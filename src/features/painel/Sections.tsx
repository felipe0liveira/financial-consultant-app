import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, useReducedMotion } from "react-native-reanimated";
import type { TransactionGroup } from "../../api/types";
import { BILL_GROUP_LABELS, categoryColors, type BillGroup, type BillViewModel } from "../../domain/bills";
import { formatBRL, formatMonthShort } from "../../domain/format";
import { fonts, radii } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { BillRow } from "../../ui/bills/BillRow";
import { AreaChart } from "../../ui/charts/AreaChart";
import { DonutChart } from "../../ui/charts/DonutChart";
import { Skeleton } from "../../ui/Skeleton";

const RANGES = [3, 6, 9];

export function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(450)}
      style={{ backgroundColor: colors.card, borderRadius: radii.card, padding: 18, gap: 12 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>{title}</Text>
        {action}
      </View>
      {children}
    </Animated.View>
  );
}

function EmptyText({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.inkSoft }}>{children}</Text>;
}

export function ChartSection({ months, values, loading, range, onRangeChange }: {
  months: string[]; values: number[]; loading: boolean; range: number; onRangeChange: (n: number) => void;
}) {
  const { colors } = useTheme();
  const empty = values.every((v) => v === 0);
  return (
    <SectionCard title="Gastos do mês">
      <View style={{ flexDirection: "row", gap: 8 }}>
        {RANGES.map((n) => {
          const active = n === range;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${n} meses`}
              onPress={() => onRangeChange(n)}
              style={{ backgroundColor: active ? colors.accent : colors.panel, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}
            >
              <Text style={{ color: active ? "#FFFFFF" : colors.inkSoft, fontSize: 14 }}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      {loading && empty ? (
        <Skeleton height={140} />
      ) : empty ? (
        <EmptyText>Nenhum dado disponível para este período.</EmptyText>
      ) : (
        <AreaChart values={values} labels={months.map(formatMonthShort)} />
      )}
    </SectionCard>
  );
}

export function UnpaidSection({ groups, allGroups = [], totalBills, onSelect, onSeeAll }: {
  groups: BillGroup[]; allGroups?: TransactionGroup[]; totalBills: number; onSelect: (b: BillViewModel) => void; onSeeAll: () => void;
}) {
  const { colors } = useTheme();
  const nonEmpty = groups.filter((g) => g.bills.length > 0);
  return (
    <SectionCard
      title="Contas a pagar"
      action={
        <Pressable accessibilityRole="button" accessibilityLabel="Ver detalhes" onPress={onSeeAll} hitSlop={8}>
          <Text style={{ color: colors.accent, fontSize: 15 }}>Ver detalhes ›</Text>
        </Pressable>
      }
    >
      {totalBills === 0 ? (
        <EmptyText>Nenhuma conta cadastrada para este mês.</EmptyText>
      ) : nonEmpty.length === 0 ? (
        <EmptyText>Tudo pago por aqui. Nenhuma conta pendente neste mês.</EmptyText>
      ) : (
        nonEmpty.map((g) => (
          <View key={g.status}>
            <Text style={{ fontWeight: "600", color: colors.inkSoft, marginTop: 4 }}>
              {`${BILL_GROUP_LABELS[g.status]} · ${g.bills.length}`}
            </Text>
            {g.bills.map((b) => (
              <BillRow key={b.selectionKey} bill={b} groups={allGroups} showPill={false} onPress={() => onSelect(b)} />
            ))}
          </View>
        ))
      )}
    </SectionCard>
  );
}

export function UpcomingSection({ bills }: { bills: BillViewModel[] }) {
  const { colors } = useTheme();
  return (
    <SectionCard title="Próximos vencimentos">
      {bills.length === 0 ? (
        <EmptyText>Nenhuma conta pendente.</EmptyText>
      ) : (
        bills.map((b) => (
          <View key={b.selectionKey} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ backgroundColor: colors.accentBg, borderRadius: 12, width: 48, paddingVertical: 6, alignItems: "center" }}>
              <Text style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.accent }}>{String(b.day).padStart(2, "0")}</Text>
              <Text style={{ fontSize: 11, color: colors.accent }}>{formatMonthShort(b.dueDate.slice(0, 7))}</Text>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.ink }}>{b.description}</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.ink }}>
              {formatBRL(Math.abs(b.amount))}
            </Text>
          </View>
        ))
      )}
    </SectionCard>
  );
}

export function CategorySection({ data }: { data: { name: string; value: number }[] }) {
  const { colors } = useTheme();
  return (
    <SectionCard title="Por categoria">
      {data.length === 0 ? (
        <EmptyText>Nenhum dado disponível.</EmptyText>
      ) : (
        <DonutChart data={data.map((d) => ({ ...d, color: colors[categoryColors(d.name).text] }))} />
      )}
    </SectionCard>
  );
}
