import { apiFetch } from "./client";
import { searchTransactionsQuery, type SearchTransactionsFilters } from "./search-query";
import type {
  GroupsResponse,
  MonthSummary,
  MonthTransactionsPage,
  SearchTransactionsResult,
} from "./types";

export function getMonth(month: string): Promise<MonthSummary> {
  return apiFetch<MonthSummary>(`months/${encodeURIComponent(month)}`);
}

export function getMonthTransactions(month: string, cursor: string | null): Promise<MonthTransactionsPage> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch<MonthTransactionsPage>(`months/${encodeURIComponent(month)}/transactions${qs}`);
}

export function searchTransactions(filters: SearchTransactionsFilters): Promise<SearchTransactionsResult> {
  const qs = searchTransactionsQuery(filters);
  return apiFetch<SearchTransactionsResult>(`transactions/search${qs ? `?${qs}` : ""}`);
}

export function getGroups(): Promise<GroupsResponse> {
  return apiFetch<GroupsResponse>("groups");
}
