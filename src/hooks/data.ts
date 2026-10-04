import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { getGroups, getMonth, getMonthTransactions, searchTransactions } from "../api/endpoints";
import type { SearchTransactionsFilters } from "../api/search-query";
import type { MonthTransactionsPage } from "../api/types";
import { groupBillsByStatus } from "../domain/bills";

export function useMonth(month: string) {
  return useQuery({ queryKey: ["month", month], queryFn: () => getMonth(month) });
}

/** Month summary + bills grouped by status (Painel, tab badge). */
export function useBills(month: string) {
  const query = useMonth(month);
  const groups = query.data ? groupBillsByStatus(query.data.transactions ?? [], month, new Date()) : undefined;
  return { ...query, groups };
}

export function useMonthHistory(months: string[]) {
  return useQueries({
    queries: months.map((month) => ({ queryKey: ["month", month], queryFn: () => getMonth(month) })),
  });
}

export function useMonthTransactions(month: string) {
  const query = useInfiniteQuery({
    queryKey: ["month-transactions", month],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getMonthTransactions(month, pageParam),
    getNextPageParam: (last: MonthTransactionsPage) => last.next_cursor,
  });
  return { ...query, transactions: (query.data?.pages ?? []).flatMap((p) => p.items) };
}

export function useSearchBills(filters: SearchTransactionsFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["bills-search", filters],
    queryFn: () => searchTransactions(filters),
    enabled,
  });
}

export function useGroups() {
  return useQuery({ queryKey: ["groups"], queryFn: getGroups });
}
