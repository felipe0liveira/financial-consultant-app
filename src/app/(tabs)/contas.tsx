import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, SectionList, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  activeFilterCount, bucketBills, currentMonth, DEFAULT_BILL_FILTERS, deriveContasKpis, filterBills,
  searchRowToTransaction, type BillFilters, type BillGroupingMode, type BillViewModel,
} from "../../domain/bills";
import { ContasKpis } from "../../features/contas/ContasKpis";
import { FilterChips } from "../../features/contas/FilterChips";
import { FiltersSheet } from "../../features/contas/FiltersSheet";
import { loadGrouping, saveGrouping } from "../../features/contas/groupingPref";
import { MonthStepper } from "../../features/contas/MonthStepper";
import { useGroups, useMonthTransactions, useSearchBills } from "../../hooks/data";
import { useOnline } from "../../hooks/status";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { NetworkError } from "../../api/client";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useOpenBillDetails } from "../../ui/bills/BillDetailsSheet";
import { SwipeableBillRow } from "../../ui/bills/SwipeableBillRow";
import { Button } from "../../ui/Button";
import { OfflineBanner } from "../../ui/OfflineBanner";
import { OfflineEmpty } from "../../ui/OfflineEmpty";
import { RefreshNotice } from "../../ui/RefreshNotice";
import { Skeleton } from "../../ui/Skeleton";

interface BillSection { key: string; title: string | null; groupId?: string | null; data: BillViewModel[] }

const SEARCH_MIN_CHARS = 2; // spec C3
const SEARCH_DEBOUNCE_MS = 300; // spec C3

export default function Contas() {
  const { colors } = useTheme();
  const online = useOnline();
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(currentMonth());
  const router = useRouter();
  const queryClient = useQueryClient();
  // Consume the month param once so returning to the tab does not snap back.
  useFocusEffect(useCallback(() => {
    if (params.month) {
      setMonth(params.month);
      router.setParams({ month: undefined });
    }
  }, [params.month, router]));

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const isSearching = debounced.length >= SEARCH_MIN_CHARS;
  const [filters, setFilters] = useState<BillFilters>(DEFAULT_BILL_FILTERS);
  const [grouping, setGrouping] = useState<BillGroupingMode>("status");
  useEffect(() => { void loadGrouping().then(setGrouping); }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openBill = useOpenBillDetails();

  const monthQuery = useMonthTransactions(month);
  const search = useSearchBills({ month, description: debounced }, isSearching && online);
  const groupsQuery = useGroups();
  const groupItems = groupsQuery.data?.items;
  const groups = useMemo(() => groupItems ?? [], [groupItems]);

  const active = useMemo(
    () => (isSearching ? (search.data?.transactions ?? []).map(searchRowToTransaction) : monthQuery.transactions),
    [isSearching, search.data, monthQuery.transactions]
  );
  const visible = useMemo(() => filterBills(active, filters, month, new Date()), [active, filters, month]);
  const effectiveGrouping = grouping === "group" && groups.length === 0 ? "status" : grouping;
  const buckets = useMemo(() => bucketBills(visible, effectiveGrouping, groups), [visible, effectiveGrouping, groups]);
  const kpis = useMemo(() => deriveContasKpis(monthQuery.transactions, month, new Date()), [monthQuery.transactions, month]);
  const categories = useMemo(
    () => [...new Set(monthQuery.transactions.map((t) => t.category))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [monthQuery.transactions]
  );
  const hasData = !!monthQuery.data;

  // Refetch stale data when the tab is shown again (spec F2); the first focus is covered by mount.
  const refetchRef = useRef({ month, refetchMonth: monthQuery.refetch, refetchGroups: groupsQuery.refetch });
  useEffect(() => {
    refetchRef.current = { month, refetchMonth: monthQuery.refetch, refetchGroups: groupsQuery.refetch };
  });
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    const cache = queryClient.getQueryCache();
    const { month: m, refetchMonth, refetchGroups } = refetchRef.current;
    if (cache.find({ queryKey: ["month-transactions", m], exact: true })?.isStale()) void refetchMonth();
    if (cache.find({ queryKey: ["groups"], exact: true })?.isStale()) void refetchGroups();
  }, [queryClient]));
  const searchOffline = isSearching && !online;

  const emptyText = isSearching
    ? "Nenhuma conta encontrada para essa busca."
    : activeFilterCount(filters) > 0
      ? "Nenhuma conta com esses filtros."
      : "Nenhuma conta cadastrada para este mês.";

  const changeMonth = (m: string) => { setMonth(m); };
  const [pulling, setPulling] = useState(false);
  const onRefresh = () => {
    setPulling(true);
    void Promise.allSettled([monthQuery.refetch(), groupsQuery.refetch()]).then(() => setPulling(false));
  };

  const skeletons = <View style={{ gap: 10 }}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></View>;
  const retryButton = (onRetry: () => void) => <Button label="Tentar novamente" variant="secondary" onPress={onRetry} />;
  let emptyComponent;
  if (searchOffline) {
    emptyComponent = <Text style={{ color: colors.warn }}>A busca precisa de conexão com a internet.</Text>;
  } else if (isSearching) {
    if (search.error) {
      emptyComponent = <Text style={{ color: colors.danger }}>Não foi possível buscar: {search.error.message}</Text>;
    } else if (!search.data) {
      emptyComponent = skeletons;
    } else {
      emptyComponent = <Text style={{ color: colors.inkSoft, textAlign: "center", padding: 24 }}>{emptyText}</Text>;
    }
  } else if (!hasData && !online) {
    emptyComponent = <OfflineEmpty onRetry={() => void monthQuery.refetch()} />;
  } else if (!hasData && monthQuery.error) {
    emptyComponent = monthQuery.error instanceof NetworkError
      ? <OfflineEmpty onRetry={() => void monthQuery.refetch()} />
      : (
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.danger }}>Não foi possível carregar as contas: {monthQuery.error.message}</Text>
          {retryButton(() => void monthQuery.refetch())}
        </View>
      );
  } else if (!hasData) {
    emptyComponent = skeletons;
  } else {
    emptyComponent = <Text style={{ color: colors.inkSoft, textAlign: "center", padding: 24 }}>{emptyText}</Text>;
  }

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Contas</Text>
      <MonthStepper month={month} onChange={changeMonth} />
      <OfflineBanner forceVisible={!!monthQuery.error && hasData} />
      <RefreshNotice isFetching={monthQuery.isFetching && !monthQuery.isFetchingNextPage && !pulling} hasData={hasData} />
      {hasData ? <ContasKpis kpis={kpis} month={month} /> : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar contas…"
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Buscar contas"
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontSize: 16 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Filtros, ${activeFilterCount(filters)} ativos`} onPress={() => setSheetOpen(true)} style={{ padding: 10, backgroundColor: colors.card, borderRadius: 12 }}>
          <Ionicons name="options-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <FilterChips filters={filters} onChange={setFilters} />
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.panel }}>
      <SectionList<BillViewModel, BillSection>
        contentContainerStyle={{ padding: 16 }}
        sections={searchOffline ? [] : buckets.map<BillSection>((b) => ({ key: b.key, title: b.label, groupId: b.groupId, data: b.bills }))}
        keyExtractor={(item, index) => `${item.selectionKey}:${index}`}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={{ marginTop: 12, fontWeight: "600", color: colors.inkSoft }}>{section.title} · {section.data.length}</Text>
          ) : <View style={{ height: 12 }} />
        }
        renderItem={({ item, section }) => (
          <SwipeableBillRow
            month={month}
            bill={item}
            groups={groups}
            hideGroupId={section.groupId}
            showPill={effectiveGrouping !== "status" ? ["overdue", "due-today"].includes(item.status) : true}
            onPress={() => openBill(item, month)}
          />
        )}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={
          !isSearching && monthQuery.hasNextPage ? (
            <Button label={monthQuery.isFetchingNextPage ? "Carregando…" : "Carregar mais"} variant="secondary" loading={monthQuery.isFetchingNextPage} onPress={() => void monthQuery.fetchNextPage()} />
          ) : null
        }
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} />}
        stickySectionHeadersEnabled={false}
      />
      <FiltersSheet
        visible={sheetOpen}
        filters={filters}
        grouping={grouping}
        categories={categories}
        hasGroups={groups.length > 0}
        previewCount={(f) => filterBills(active, f, month, new Date()).length}
        onApply={(f, g) => { setFilters(f); setGrouping(g); void saveGrouping(g); setSheetOpen(false); }}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}
