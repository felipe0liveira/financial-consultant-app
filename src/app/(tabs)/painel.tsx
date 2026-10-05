import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { NetworkError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { firstName } from "../../auth/session";
import { currentMonth, lastNMonths } from "../../domain/bills";
import { formatHeaderDate } from "../../domain/format";
import { categoryTotals, derivePainelKpis, expenseSeries, upcomingBills } from "../../features/painel/derive";
import { KpiCards } from "../../features/painel/KpiCards";
import { CategorySection, ChartSection, UnpaidSection, UpcomingSection } from "../../features/painel/Sections";
import { useBills, useGroups, useMonthHistory } from "../../hooks/data";
import { useOnline } from "../../hooks/status";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts } from "../../theme/tokens";
import { Button } from "../../ui/Button";
import { useOpenBillDetails } from "../../ui/bills/BillDetailsSheet";
import { NewBillButton } from "../../ui/bills/NewBillButton";
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
  const openBill = useOpenBillDetails();
  const [pulling, setPulling] = useState(false);
  const bills = useBills(month);
  const months = useMemo(() => lastNMonths(range), [range]);
  const history = useMonthHistory(months);
  const groups = bills.groups ?? [];
  const kpis = derivePainelKpis(groups, bills.data);
  const hasData = !!bills.data;
  const groupsQuery = useGroups();
  const allGroups = groupsQuery.data?.items ?? [];
  const queryClient = useQueryClient();
  const firstFocus = useRef(true);

  // Refetch on tab focus, but only stale queries and never on the very first focus (mount fetch covers it).
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      const cache = queryClient.getQueryCache();
      for (const m of new Set([month, ...months])) {
        if (cache.find({ queryKey: ["month", m] })?.isStale()) void queryClient.refetchQueries({ queryKey: ["month", m] });
      }
    }, [queryClient, month, months]),
  );

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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>
          Olá, {session ? firstName(session.profile) : ""}
        </Text>
        <NewBillButton month={month} />
      </View>
      <Text style={{ color: colors.inkSoft }}>
        {formatHeaderDate(new Date())} · você tem {kpis.totalBills} {kpis.totalBills === 1 ? "conta" : "contas"} este mês
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
        <OfflineBanner forceVisible={!!bills.error && hasData} />
        <RefreshNotice isFetching={bills.isFetching && !pulling} hasData={hasData} />
        {!hasData && !online && !bills.error ? <OfflineEmpty onRetry={() => void bills.refetch()} /> : null}
        {!hasData && online && !bills.error ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={120} />
            <Skeleton height={90} />
            <Skeleton height={90} />
            <Skeleton height={180} />
          </View>
        ) : null}
        {bills.error && !hasData && online ? (
          bills.error instanceof NetworkError ? (
            <OfflineEmpty onRetry={() => void bills.refetch()} />
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ color: colors.danger }}>Não foi possível carregar os dados do mês: {bills.error.message}</Text>
              <Button label="Tentar novamente" variant="secondary" onPress={() => void bills.refetch()} />
            </View>
          )
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
              allGroups={allGroups}
              month={month}
              onSelect={(b) => openBill(b, month)}
              onSeeAll={() => router.push({ pathname: "/contas", params: { month } })}
            />
            <UpcomingSection bills={upcomingBills(groups)} />
            <CategorySection data={categoryTotals(bills.data?.transactions ?? [])} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
