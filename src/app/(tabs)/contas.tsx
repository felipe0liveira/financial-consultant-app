import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { BillDetailsSheet } from "../../ui/bills/BillDetailsSheet";
import { BillRow } from "../../ui/bills/BillRow";
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
  useFocusEffect(useCallback(() => { if (params.month) setMonth(params.month); }, [params.month]));

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const isSearching = debounced.length >= SEARCH_MIN_CHARS;
  const [filters, setFilters] = useState<BillFilters>(DEFAULT_BILL_FILTERS);
  const [grouping, setGrouping] = useState<BillGroupingMode>("status");
  useEffect(() => { void loadGrouping().then(setGrouping); }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<BillViewModel | null>(null);

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

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Contas</Text>
      <MonthStepper month={month} onChange={changeMonth} />
      <OfflineBanner />
      <RefreshNotice isFetching={monthQuery.isFetching} hasData={hasData} />
      {hasData ? <ContasKpis kpis={kpis} /> : null}
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
      {isSearching && !online ? <Text style={{ color: colors.warn }}>A busca precisa de conexão com a internet.</Text> : null}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.panel }}>
      <SectionList<BillViewModel, BillSection>
        contentContainerStyle={{ padding: 16 }}
        sections={buckets.map<BillSection>((b) => ({ key: b.key, title: b.label, groupId: b.groupId, data: b.bills }))}
        keyExtractor={(item, index) => `${item.selectionKey}:${index}`}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={{ marginTop: 12, fontWeight: "600", color: colors.inkSoft }}>{section.title} · {section.data.length}</Text>
          ) : <View style={{ height: 12 }} />
        }
        renderItem={({ item, section }) => (
          <BillRow
            bill={item}
            groups={groups}
            hideGroupId={section.groupId}
            showPill={effectiveGrouping !== "status" ? ["overdue", "due-today"].includes(item.status) : true}
            onPress={() => setSelected(item)}
          />
        )}
        ListEmptyComponent={
          !hasData && !online ? <OfflineEmpty onRetry={() => void monthQuery.refetch()} />
            : !hasData ? <View style={{ gap: 10 }}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></View>
            : monthQuery.error ? <Text style={{ color: colors.danger }}>Não foi possível carregar as contas: {monthQuery.error.message}</Text>
            : <Text style={{ color: colors.inkSoft, textAlign: "center", padding: 24 }}>{emptyText}</Text>
        }
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
      <BillDetailsSheet bill={selected} groups={groups} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
