import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthProvider";
import { firstName } from "../../auth/session";
import { currentMonth, lastNMonths, type BillViewModel } from "../../domain/bills";
import { formatHeaderDate } from "../../domain/format";
import { categoryTotals, derivePainelKpis, expenseSeries, upcomingBills } from "../../features/painel/derive";
import { KpiCards } from "../../features/painel/KpiCards";
import { CategorySection, ChartSection, UnpaidSection, UpcomingSection } from "../../features/painel/Sections";
import { useBills, useMonthHistory } from "../../hooks/data";
import { useOnline } from "../../hooks/status";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { BillDetailsSheet } from "../../ui/bills/BillDetailsSheet";
import { OfflineBanner } from "../../ui/OfflineBanner";
import { OfflineEmpty } from "../../ui/OfflineEmpty";
import { RefreshNotice } from "../../ui/RefreshNotice";
import { Skeleton } from "../../ui/Skeleton";

export default function Painel() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const online = useOnline();
  const month = currentMonth();
  const [range, setRange] = useState(3);
  const [selected, setSelected] = useState<BillViewModel | null>(null);
  const [pulling, setPulling] = useState(false);
  const bills = useBills(month);
  const months = useMemo(() => lastNMonths(range), [range]);
  const history = useMonthHistory(months);
  const groups = bills.groups ?? [];
  const kpis = derivePainelKpis(groups, bills.data);
  const hasData = !!bills.data;

  const refresh = async () => {
    setPulling(true);
    try {
      await Promise.all([bills.refetch(), ...history.map((h) => h.refetch())]);
    } finally {
      setPulling(false);
    }
  };

  const header = (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>
        Olá, {session ? firstName(session.profile) : ""}
      </Text>
      <Text style={{ color: colors.inkSoft }}>
        {formatHeaderDate(new Date())} · você tem {kpis.totalBills} contas este mês
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.panel }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void refresh()} />}
      >
        {header}
        <OfflineBanner />
        <RefreshNotice isFetching={bills.isFetching && !pulling} hasData={hasData} />
        {!hasData && !online ? <OfflineEmpty onRetry={() => void bills.refetch()} /> : null}
        {!hasData && online && !bills.error ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={120} />
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={180} />
          </View>
        ) : null}
        {bills.error && !hasData && online ? (
          <Text style={{ color: colors.danger }}>Não foi possível carregar os dados do mês: {bills.error.message}</Text>
        ) : null}
        {hasData ? (
          <>
            <KpiCards kpis={kpis} />
            <ChartSection
              months={months}
              values={expenseSeries(history.map((h) => h.data))}
              loading={history.some((h) => h.isLoading)}
              range={range}
              onRangeChange={setRange}
            />
            <UnpaidSection
              groups={groups.filter((g) => g.status !== "paid")}
              totalBills={kpis.totalBills}
              onSelect={setSelected}
              onSeeAll={() => router.push({ pathname: "/contas", params: { month } })}
            />
            <UpcomingSection bills={upcomingBills(groups)} />
            <CategorySection data={categoryTotals(bills.data?.transactions ?? [])} />
          </>
        ) : null}
      </ScrollView>
      <BillDetailsSheet bill={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
