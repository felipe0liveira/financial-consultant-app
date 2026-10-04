/**
 * Client-safe query-string builder for transaction search.
 *
 * Kept OUT of lib/api.ts (which is `server-only`) so both server code
 * (lib/api.ts `searchTransactions`) and client code (hooks/use-search-bills.ts)
 * can build the same query string without dragging the secret-holding server
 * module into the client bundle.
 */

/** Filters for GET /transactions/search (mirrors the search_transactions tool). */
export interface SearchTransactionsFilters {
  minAmount?: number;
  maxAmount?: number;
  category?: string;
  description?: string;
  comment?: string;
  /** Substring against YYYY-MM keys; pass the full YYYY-MM to scope to one month. */
  month?: string;
  confirmed?: boolean;
}

/** Builds the query string for GET /transactions/search from typed filters. */
export function searchTransactionsQuery(
  filters: SearchTransactionsFilters
): string {
  const params = new URLSearchParams();
  if (filters.minAmount !== undefined)
    params.set("min_amount", String(filters.minAmount));
  if (filters.maxAmount !== undefined)
    params.set("max_amount", String(filters.maxAmount));
  if (filters.category) params.set("category", filters.category);
  if (filters.description) params.set("description", filters.description);
  if (filters.comment) params.set("comment", filters.comment);
  if (filters.month) params.set("month", filters.month);
  if (filters.confirmed !== undefined)
    params.set("confirmed", String(filters.confirmed));
  return params.toString();
}
