import { apiFetch } from "./client";
import { searchTransactionsQuery, type SearchTransactionsFilters } from "./search-query";
import type { BillMatch } from "../domain/billActions";
import type {
  AddCategoryResult,
  CreateBillInput,
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

/** PATCH /transactions — confirm or unconfirm one bill. */
export function setTransactionConfirmed(match: BillMatch, confirmed: boolean): Promise<unknown> {
  return apiFetch("transactions", { method: "PATCH", body: JSON.stringify({ ...match, confirmed }) });
}

/** DELETE /transactions — delete one bill (recurring occurrences become skipped server-side). */
export function deleteTransaction(match: BillMatch): Promise<unknown> {
  return apiFetch("transactions", { method: "DELETE", body: JSON.stringify(match) });
}

/** DELETE /installments/{id} — delete a whole installment series. */
export function deleteInstallmentSeries(seriesId: string): Promise<unknown> {
  return apiFetch(`installments/${encodeURIComponent(seriesId)}`, { method: "DELETE" });
}

/** POST /transactions — create a bill, income, recurring rule or installment series. */
export function createTransaction(input: CreateBillInput): Promise<unknown> {
  return apiFetch("transactions", { method: "POST", body: JSON.stringify(input) });
}

/** GET /categories — the household's saved catalog (bare string[]). */
export function getCategories(): Promise<string[]> {
  return apiFetch<string[]>("categories");
}

/** POST /categories — add a category (idempotent upstream). */
export function addCategory(name: string): Promise<AddCategoryResult> {
  return apiFetch<AddCategoryResult>("categories", { method: "POST", body: JSON.stringify({ name }) });
}
