/** Response types of the BFF /api/v1 routes — copied from financial-consultant-web/lib/api.ts. */

/**
 * A single financial transaction from the -api ledger.
 *
 * The -api is a transaction ledger — there is no native "due/paid/overdue"
 * flag. Bill status is derived by the BFF from `confirmed` + `day` vs today.
 * See lib/bills.ts for that logic.
 */
export interface Transaction {
  /**
   * Physical document id, or `null` for a VIRTUAL occurrence — a projection
   * (recurring rule or installment series) not yet materialized into a real
   * row. Confirming/paying a virtual row materializes it (see usePayBill /
   * useMaterializeRecurring, matched by month + description + day + amount).
   */
  transaction_id: string | null;
  user_id: string;
  /** Day-of-month (1–31) the transaction falls on. */
  day: number;
  category: string;
  description: string;
  /** Amount in BRL (negative = expense, positive = income by convention). */
  amount: number;
  /** true = paid / confirmed; false = pending / projected. */
  confirmed: boolean;
  /**
   * Instalment link when this row is a parcela of a larger purchase, else null.
   * `{current, total}` is the parcela position; `id` is the installment series
   * id used to address the whole series (e.g. a series-wide sign/category edit —
   * see updateSeries). Legacy parcelas predating the series collection carry no
   * `id`, so it is optional. Serialized straight through from the -api, whose
   * projection stamps `{current, total, id}` on every occurrence.
   */
  installment: { current: number; total: number; id?: string } | null;
  comment: string | null;
  /** Ids of the transaction groups this bill is assigned to (N:N). */
  group_ids: string[];
  recurring_rule_id: string | null;
  skipped: boolean;
}

/**
 * Aggregated income/expense figures inside a MonthSummary.
 * Mirrors the `overview` object of the -api's `get_month_summary`.
 * All expense figures are SIGNED and negative (ledger convention).
 */
export interface MonthOverview {
  /** Sum of income rows (positive). */
  total_income: number;
  /** Sum of expense rows (negative). */
  total_expenses: number;
  /** Confirmed (already-received) income (positive). */
  confirmed_income: number;
  /** Confirmed (already-paid) expenses (negative). */
  confirmed_expenses: number;
  /** confirmed_income + confirmed_expenses. */
  confirmed_balance: number;
}

/**
 * Month summary returned by GET /api/v1/months/{month}.
 * Mirrors the -api's `get_month_summary` return shape: `balance` is a plain
 * number (net of the month), and the income/expense split lives under
 * `overview` — NOT under `balance`.
 */
export interface MonthSummary {
  month: string; // "YYYY-MM"
  /** Net of every non-skipped row for the month (income − expenses). */
  balance: number;
  /** Real balance that existed before day 1; null when never configured. */
  opening_balance: number | null;
  /** opening + confirmed-only rows. */
  real_balance: number;
  /** opening + all rows (confirmed + pending). */
  projected_balance: number;
  /** Unconfirmed expenses (negative). */
  pending_expenses: number;
  /** Unconfirmed income (positive). */
  pending_income: number;
  /** opening_component + income_component. */
  total_inflow: number;
  /** Effective opening balance (0 when not set). */
  opening_component: number;
  /** Total income (confirmed + pending). */
  income_component: number;
  /** Pre-computed income/expense aggregates. */
  overview: MonthOverview;
  /** Number of confirmed rows. */
  paid_count: number;
  /** Number of pending rows. */
  pending_count: number;
  transactions: Transaction[];
  latest_checkpoint?: Record<string, unknown> | null;
  budgets?: BudgetEntry[];
}

export interface BudgetEntry {
  category: string;
  budget: number;
  spent: number;
}

/** Paginated transactions response from GET /api/v1/months/{month}/transactions. */
export interface MonthTransactionsPage {
  items: Transaction[];
  next_cursor: string | null;
}

/**
 * Direction of a bill: money going out (an expense, stored negative) or coming
 * in (income, stored positive). The UI always types a POSITIVE magnitude and
 * picks a direction; the signed ledger amount is derived from the two via
 * {@link signedAmount} (lib/bills.ts).
 */
export type BillDirection = "in" | "out";

/**
 * A single row in a search result. Lighter than {@link Transaction}: it carries
 * its own `month` and omits `transaction_id` / `user_id` / `installment` /
 * `recurring_rule_id` (search never needs to address the physical row).
 */
export interface SearchTransactionRow {
  month: string;
  day: number;
  category: string;
  description: string;
  amount: number;
  confirmed: boolean;
  comment: string | null;
  /** Ids of the transaction groups this row is assigned to (N:N). */
  group_ids: string[];
  skipped: boolean;
}

/** Non-summary response from GET /transactions/search. */
export interface SearchTransactionsResult {
  count: number;
  total: number;
  transactions: SearchTransactionRow[];
}

/**
 * One entry of the GET /api/v1/groups list.
 *
 * A group is now a first-class entity addressed by `group_id`, with a `name`,
 * a colour token (see `lib/groups.ts`), and a `member_count` (how many bills
 * are assigned to it). The list is month-independent.
 */
export interface TransactionGroup {
  group_id: string;
  name: string;
  color: string;
  member_count: number;
}

/** Envelope returned by GET /api/v1/groups. */
export interface GroupsResponse {
  items: TransactionGroup[];
}

/** Body of POST /api/v1/transactions — mirrors the web's CreateBillInput (lib/api.ts). */
export interface CreateBillInput {
  month: string; // "YYYY-MM"
  day: number;
  category: string;
  description: string;
  /** Positive magnitude in reais; `direction` decides the sign server-side. */
  amount: number;
  direction: BillDirection;
  recurring: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentBackfillPaid?: boolean;
  recurringBackfillPaid?: boolean;
}

/** Result of POST /api/v1/categories (idempotent: an existing name returns already_exists). */
export interface AddCategoryResult {
  status: string;
  name: string;
  already_exists?: boolean;
}
