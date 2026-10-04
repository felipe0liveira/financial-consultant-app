/**
 * Bill view-model: derives a "bills-to-pay" display status for each
 * transaction in the current month.
 *
 * ── DESIGN ASSUMPTION ─────────────────────────────────────────────────────
 * The financial-consultant-api is a transaction ledger, NOT a native
 * accounts-payable system. There is no server-side "due date / overdue /
 * paid" flag on a transaction. This module derives that view-model purely
 * from two fields that ARE present:
 *
 *   confirmed: boolean       — true if the user has marked the bill as paid
 *   day: number              — day-of-month (1–31) the bill falls on
 *   transaction_id: string?  — null for a VIRTUAL occurrence (a projection —
 *                              recurring rule / installment series — not yet
 *                              materialized into a real row)
 *
 * combined with "today" (passed in as a parameter so the function stays
 * pure and unit-testable without Date mocking).
 *
 * Bucketing rules (in priority order):
 *   confirmed=true                                 → "paid"
 *   confirmed=false, virtual (no id), full date < today → "projected"
 *   confirmed=false, real,          full date < today   → "overdue"
 *   confirmed=false, full date = today                  → "due-today"
 *   confirmed=false, 1 ≤ days_away ≤ 7                  → "this-week"
 *   confirmed=false, days_away > 7                      → "upcoming"
 *
 * "projected" ("prevista") is the key distinction: an unmaterialized past
 * occurrence is a history-preview of a projected bill, NOT a forgotten one —
 * so it must never read as "overdue". "overdue" stays reserved for REAL
 * (materialized, transaction_id != null) unconfirmed past-due rows.
 *
 * "Full date" is constructed as YYYY-MM-DD from the transaction's month
 * string and its day field.
 * ──────────────────────────────────────────────────────────────────────────
 */

import type { BillDirection, SearchTransactionRow, Transaction, TransactionGroup } from "../api/types";
import type { ColorToken } from "../theme/tokens";
import { realsToCents, centsToReals } from "./money";

/**
 * Maps a positive magnitude + a {@link BillDirection} to the ledger's signed
 * amount: income ("in") stays positive, an expense ("out") becomes negative.
 * The sign of the input magnitude is ignored — only its absolute value counts.
 *
 * Lives here (not the `server-only` lib/api.ts) so both client hooks and the
 * server BFF adapters can share the exact same sign rule.
 */
export function signedAmount(magnitude: number, direction: BillDirection): number {
  return direction === "in" ? Math.abs(magnitude) : -Math.abs(magnitude);
}

/**
 * The {@link BillDirection} implied by a signed ledger amount: a positive amount
 * is income ("in"), zero or negative is an expense ("out").
 */
export function directionOf(amount: number): BillDirection {
  return amount > 0 ? "in" : "out";
}

/** Derived status bucket for display purposes. */
export type BillStatus =
  | "paid"
  | "overdue"
  | "due-today"
  | "this-week"
  | "upcoming"
  | "projected";

/**
 * A transaction plus its derived display status — everything knowable from a
 * single row.
 */
export interface DerivedBill extends Transaction {
  status: BillStatus;
  /** Full date derived from month + day, e.g. "2026-07-08". */
  dueDate: string;
  /** Days until (or since, negative) the bill is due. */
  daysFromToday: number;
}

/**
 * A derived bill plus the identity used to select it.
 *
 * `selectionKey` is deliberately NOT part of {@link DerivedBill}: a virtual
 * row's occurrence index only means anything measured against every other row
 * sharing its status, so it cannot be computed from one transaction. It is
 * stamped by {@link toBillViewModels}, which holds the whole month.
 */
export interface BillViewModel extends DerivedBill {
  /**
   * Stable identity for selection. A real `transaction_id` when the row has
   * one; otherwise a content key scoped by status and occurrence.
   *
   * Scoped by the bill's STATUS, never by the bucket it renders in. Under the
   * "group" axis the same bill renders in every group it belongs to, and all
   * of those copies must resolve to this one key — otherwise the same bill can
   * be ticked twice and counted twice.
   */
  selectionKey: string;
}

/** A group of bills sharing the same display status. */
export interface BillGroup {
  status: BillStatus;
  bills: BillViewModel[];
}

/** Which axis the Contas list is bucketed by. */
export type BillGroupingMode = "status" | "category" | "group";

/** A status filter value: one derived status, or "all" for no filter. */
export type BillStatusFilter = BillStatus | "all";

/** Status filter options (pt-BR labels), in display order, plus "all". */
export const BILL_STATUS_FILTERS: { value: BillStatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "overdue", label: "Atrasadas" },
  { value: "due-today", label: "Vencem hoje" },
  { value: "this-week", label: "Esta semana" },
  { value: "upcoming", label: "Próximas" },
  { value: "paid", label: "Pagas" },
  { value: "projected", label: "Previstas" },
];

/**
 * The Contas list filters. Both are single-choice; "all" means "not filtered".
 * The grouping axis is deliberately NOT here — it is a view setting, not a filter.
 */
export interface BillFilters {
  status: BillStatusFilter;
  category: string;
}

export const DEFAULT_BILL_FILTERS: BillFilters = { status: "all", category: "all" };

/** Number of filters that differ from "all" (0, 1 or 2). */
export function activeFilterCount(filters: BillFilters): number {
  return (filters.status !== "all" ? 1 : 0) + (filters.category !== "all" ? 1 : 0);
}

/**
 * How a bucket heading is tinted. The lib returns data, not JSX — the renderer
 * maps this to lucide icons and Tailwind classes, because icons are JSX and
 * must not leak into a pure module.
 */
export type BillBucketAccent =
  | { kind: "status"; status: BillStatus }
  | { kind: "category"; category: string }
  | { kind: "group"; color: string };

/** One rendered section of the Contas list, under any grouping mode. */
export interface BillBucket {
  /** Stable React key / aria identity, unique within one bucketing. */
  key: string;
  /**
   * Heading text. `null` renders the section with NO heading at all — no
   * label, no count, no icon. That is the trailing bucket for rows the axis
   * does not classify; naming it "sem grupo" would give a non-group the visual
   * weight of a group.
   */
  label: string | null;
  /** Heading tint, or null alongside a null label. */
  accent: BillBucketAccent | null;
  /**
   * The group this bucket represents, under mode "group" only. Rows read it to
   * drop the chip for their own bucket, which the heading already states. Null
   * in every other mode.
   */
  groupId: string | null;
  bills: BillViewModel[];
}

/**
 * Derives the bill status for a single transaction.
 *
 * @param transaction  The transaction from the API
 * @param month        YYYY-MM string the transaction belongs to
 * @param today        Reference date (use new Date() at the call site)
 */
export function deriveBillStatus(
  transaction: Transaction,
  month: string,
  today: Date
): DerivedBill {
  const [year, mon] = month.split("-").map(Number);
  // Construct a midnight-local date for the bill's due day.
  const dueDate = new Date(year, mon - 1, transaction.day);

  // Normalize "today" to midnight for day-accurate comparisons.
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  // Calendar difference in whole days.
  const msPerDay = 86_400_000;
  const daysFromToday = Math.round(
    (dueDate.getTime() - todayMidnight.getTime()) / msPerDay
  );

  // A virtual occurrence (projection not yet materialized) carries no physical
  // document id. Recurring projections and installment projections both arrive
  // this way from the -api.
  const isVirtual = transaction.transaction_id == null;

  let status: BillStatus;

  if (transaction.confirmed) {
    status = "paid";
  } else if (daysFromToday < 0) {
    // Past-due and unconfirmed: a real row is "overdue", but an unmaterialized
    // projection is only "projected" (prevista) — a history-preview, not a
    // forgotten bill.
    status = isVirtual ? "projected" : "overdue";
  } else if (daysFromToday === 0) {
    status = "due-today";
  } else if (daysFromToday <= 7) {
    status = "this-week";
  } else {
    status = "upcoming";
  }

  const dueDateStr = [
    String(year),
    String(mon).padStart(2, "0"),
    String(transaction.day).padStart(2, "0"),
  ].join("-");

  return {
    ...transaction,
    status,
    dueDate: dueDateStr,
    daysFromToday,
  };
}

/**
 * Derives the display view-model for a month's transactions: drops `skipped`
 * rows, assigns each row its status, sorts by day, and stamps each row with the
 * `selectionKey` that identifies it.
 *
 * The key is computed HERE, over the filtered set for the current view (the
 * caller passes whatever category-filtered list it is about to render), rather
 * than by the renderer. Nothing about a bill's own fields is guaranteed unique: two virtual
 * rows can share description, day and amount (two "Uber" bills of R$ 25 on day
 * 10), so identical-looking rows are told apart by their occurrence — and an
 * occurrence index is only meaningful against the complete set of rows sharing
 * a status.
 *
 * Only rows WITHOUT a usable id consume an occurrence. A materialized row is
 * identified by its `transaction_id` and must not shift the numbering of a
 * virtual row that happens to look like it.
 */
export function toBillViewModels(
  transactions: Transaction[],
  month: string,
  today: Date
): BillViewModel[] {
  const derived: DerivedBill[] = [];
  for (const tx of transactions) {
    if (tx.skipped) continue;
    derived.push(deriveBillStatus(tx, month, today));
  }

  // Sorted once, here, so every bucketing downstream is day-ordered without
  // re-sorting — and so occurrences below are numbered in render order.
  derived.sort((a, b) => a.day - b.day);

  const occurrences = new Map<string, number>();
  return derived.map((bill) => {
    // The `!== ""` half of this guard is load-bearing, not defensive filler.
    // A server-search result row is normalized with `transaction_id: ""`
    // (see `searchRowToTransaction` in components/bills/bills-client.tsx) —
    // `deriveBillStatus` treats that "" as physical (isVirtual checks `== null`
    // only), but selection identity must treat it as virtual. Simplify this to
    // `!= null` and every search row collapses onto `selectionKey === ""`:
    // ticking one search result would tick all of them.
    const hasUsableId =
      bill.transaction_id != null && bill.transaction_id !== "";
    if (hasUsableId) {
      return { ...bill, selectionKey: bill.transaction_id as string };
    }
    const content = `${bill.status}|${bill.description}|${bill.day}|${bill.amount}`;
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return {
      ...bill,
      selectionKey: `virtual|${content}|${occurrence}`,
    };
  });
}

/**
 * Category-filters the rows, derives view models, then status-filters them.
 * Filter first, bucket second: the status filter works on bills rather than on
 * buckets so it keeps working under an axis that has no status buckets.
 * Shared by the Contas list and the filter sheet's "Ver N contas" preview.
 */
export function filterBills(
  transactions: Transaction[],
  filters: BillFilters,
  month: string,
  today: Date
): BillViewModel[] {
  const rows =
    filters.category === "all"
      ? transactions
      : transactions.filter((tx) => tx.category === filters.category);
  const bills = toBillViewModels(rows, month, today);
  return filters.status === "all"
    ? bills
    : bills.filter((bill) => bill.status === filters.status);
}

/**
 * The fields that identify a bill across re-derivations: paying it, changing
 * its groups or re-bucketing it never changes them. `transactionId` is null for
 * a virtual (projected) row.
 */
export interface BillRef {
  transactionId: string | null;
  description: string;
  day: number;
  amount: number;
}

export function billRefOf(bill: BillViewModel): BillRef {
  return {
    transactionId: bill.transaction_id || null,
    description: bill.description,
    day: bill.day,
    amount: bill.amount,
  };
}

/**
 * Resolves a bill by identity in a freshly derived list: by transaction id when
 * there is one, else by content. Paying a virtual row materializes it (it gains
 * an id), which is why the content match is always tried as a fallback.
 */
export function findBill(
  bills: BillViewModel[],
  ref: BillRef
): BillViewModel | undefined {
  if (ref.transactionId) {
    const byId = bills.find((b) => b.transaction_id === ref.transactionId);
    if (byId) return byId;
  }
  return bills.find(
    (b) =>
      b.description === ref.description &&
      b.day === ref.day &&
      b.amount === ref.amount
  );
}

/**
 * Display order of the status buckets. Module-level so `groupBillsByStatus` and
 * `bucketBills` cannot drift apart.
 */
const STATUS_ORDER: BillStatus[] = [
  "overdue",
  "due-today",
  "this-week",
  "upcoming",
  "paid",
  "projected",
];

/**
 * Partitions already-derived bills into the status buckets, in display order,
 * dropping empty ones. No sort: {@link toBillViewModels} already ordered the
 * whole month by day, and partitioning preserves that order within each bucket.
 */
function partitionByStatus(bills: BillViewModel[]): BillGroup[] {
  const groups = new Map<BillStatus, BillViewModel[]>(
    STATUS_ORDER.map((status) => [status, []])
  );
  for (const bill of bills) groups.get(bill.status)!.push(bill);

  return STATUS_ORDER.map((status) => ({
    status,
    bills: groups.get(status)!,
  })).filter((group) => group.bills.length > 0);
}

/**
 * Derives the bills-to-pay view-model for a full month's transaction list,
 * grouped in display order: overdue → due-today → this-week → upcoming → paid
 * → projected. "projected" (prevista) sits last as a low-priority
 * history-preview bucket. Filters out transactions marked as `skipped`.
 *
 * Signature and return type are load-bearing: the Home widget consumes this
 * through useBills and must not notice that its body changed.
 *
 * @param transactions  All transactions for the month
 * @param month         YYYY-MM string
 * @param today         Reference date (caller provides for testability)
 */
export function groupBillsByStatus(
  transactions: Transaction[],
  month: string,
  today: Date
): BillGroup[] {
  return partitionByStatus(toBillViewModels(transactions, month, today));
}

/**
 * The trailing bucket for rows the active axis does not classify. Deliberately
 * headless — see {@link BillBucket.label}.
 */
function untitledBucket(bills: BillViewModel[]): BillBucket {
  return { key: "untitled", label: null, accent: null, groupId: null, bills };
}

/**
 * One bucket per distinct category, alphabetical pt-BR. A blank or
 * whitespace-only category is not a category: those rows fall into the
 * untitled tail rather than rendering an empty heading.
 */
function bucketByCategory(bills: BillViewModel[]): BillBucket[] {
  const byCategory = new Map<string, BillViewModel[]>();
  const untitled: BillViewModel[] = [];

  for (const bill of bills) {
    const category = bill.category.trim();
    if (!category) {
      untitled.push(bill);
      continue;
    }
    const existing = byCategory.get(category);
    if (existing) existing.push(bill);
    else byCategory.set(category, [bill]);
  }

  const buckets: BillBucket[] = Array.from(byCategory.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([category, categoryBills]) => ({
      key: `category:${category}`,
      label: category,
      accent: { kind: "category" as const, category },
      groupId: null,
      bills: categoryBills,
    }));

  return untitled.length > 0 ? [...buckets, untitledBucket(untitled)] : buckets;
}

/**
 * One bucket per group referenced by the month's bills, alphabetical pt-BR by
 * group name.
 *
 * A bill belonging to several groups renders in EACH of them. That duplication
 * is deliberate — it makes every bucket an honest rollup of its group — and it
 * is why `selectionKey` is anchored to status rather than to the bucket: the
 * copies must tick together and be counted once. Callers must count distinct
 * bills, never rendered rows.
 *
 * A `group_id` that no longer resolves to an entity is ignored, matching what
 * BillManageRow already does with its chips; a bill left with none falls into
 * the untitled tail.
 */
function bucketByGroup(
  bills: BillViewModel[],
  groupEntities: TransactionGroup[]
): BillBucket[] {
  const byId = new Map(groupEntities.map((group) => [group.group_id, group]));
  const byGroup = new Map<string, BillViewModel[]>();
  const ungrouped: BillViewModel[] = [];

  for (const bill of bills) {
    // Deduped: a repeated id in group_ids would render the bill twice inside
    // ONE bucket, which is duplication that says nothing.
    const ids = Array.from(new Set(bill.group_ids ?? [])).filter((id) =>
      byId.has(id)
    );
    if (ids.length === 0) {
      ungrouped.push(bill);
      continue;
    }
    for (const id of ids) {
      const existing = byGroup.get(id);
      if (existing) existing.push(bill);
      else byGroup.set(id, [bill]);
    }
  }

  const buckets: BillBucket[] = Array.from(byGroup.entries())
    .map(([groupId, groupBills]) => ({
      group: byId.get(groupId)!,
      groupBills,
    }))
    .sort((a, b) => a.group.name.localeCompare(b.group.name, "pt-BR"))
    .map(({ group, groupBills }) => ({
      key: `group:${group.group_id}`,
      label: group.name,
      accent: { kind: "group" as const, color: group.color },
      groupId: group.group_id,
      bills: groupBills,
    }));

  return ungrouped.length > 0
    ? [...buckets, untitledBucket(ungrouped)]
    : buckets;
}

/**
 * Buckets already-derived bills along the chosen axis. Empty buckets are
 * dropped. The untitled tail, when there is one, is always last.
 *
 * `groupEntities` is only read under mode "group"; the other two ignore it.
 */
export function bucketBills(
  bills: BillViewModel[],
  mode: BillGroupingMode,
  groupEntities: TransactionGroup[]
): BillBucket[] {
  if (mode === "category") return bucketByCategory(bills);
  if (mode === "group") return bucketByGroup(bills, groupEntities);

  return partitionByStatus(bills).map((group) => ({
    key: `status:${group.status}`,
    label: BILL_GROUP_LABELS[group.status],
    accent: { kind: "status" as const, status: group.status },
    groupId: null,
    bills: group.bills,
  }));
}

/**
 * KPI totals for the Contas page header, all as positive magnitudes.
 *
 * `dueToday` is the outflow-or-inflow magnitude of everything with a
 * `"due-today"` status. Income and expense are each split into pending /
 * confirmed so a flip card can show "A receber ⇄ Recebido" and "A pagar ⇄
 * Pago". The paid/unpaid split mirrors the dashboard KPIs (see
 * `components/dashboard/dashboard-client.tsx`): only outflow rows feed the
 * expense totals, only inflow rows feed the income totals, so Home and Contas
 * always agree.
 */
export interface ContasKpis {
  /** Sum of |amount| of every bill whose status is "due-today". */
  dueToday: number;
  /** Pending income: sum of amount where amount > 0 && !confirmed. */
  aReceber: number;
  /** Confirmed income: sum of amount where amount > 0 && confirmed. */
  recebido: number;
  /** Pending expense magnitude: |amount| where amount < 0 && !confirmed. */
  aPagar: number;
  /** Confirmed expense magnitude: |amount| where amount < 0 && confirmed. */
  pago: number;
  /** Total income: sum of amount where amount > 0 (pending + confirmed). */
  totalIncome: number;
  /** Total expense magnitude: sum of |amount| where amount < 0 (pending + confirmed). */
  totalExpense: number;
  /**
   * The month's free/left-over balance: `totalIncome - totalExpense`. Can be
   * negative when expenses outrun income.
   */
  saldoLivre: number;
  /**
   * `saldoLivre` as a percentage of `totalIncome`, or `null` when there is no
   * income this month (guards divide-by-zero → the UI renders "—").
   */
  saldoLivrePct: number | null;
}

/**
 * Derives the {@link ContasKpis} totals for a month's transactions.
 *
 * `skipped` rows are excluded (they're out of every aggregation, same as
 * {@link groupBillsByStatus}). `today` is passed in so the function stays pure
 * and the "due-today" bucket is computed with {@link deriveBillStatus} — which
 * naturally yields nothing on any month other than the current one.
 */
export function deriveContasKpis(
  transactions: Transaction[],
  month: string,
  today: Date
): ContasKpis {
  const kpis: ContasKpis = {
    dueToday: 0,
    aReceber: 0,
    recebido: 0,
    aPagar: 0,
    pago: 0,
    totalIncome: 0,
    totalExpense: 0,
    saldoLivre: 0,
    saldoLivrePct: null,
  };

  for (const tx of transactions) {
    if (tx.skipped) continue;

    const { status } = deriveBillStatus(tx, month, today);
    if (status === "due-today") {
      kpis.dueToday += Math.abs(tx.amount);
    }

    if (tx.amount > 0) {
      kpis.totalIncome += tx.amount;
      if (tx.confirmed) kpis.recebido += tx.amount;
      else kpis.aReceber += tx.amount;
    } else if (tx.amount < 0) {
      kpis.totalExpense += Math.abs(tx.amount);
      if (tx.confirmed) kpis.pago += Math.abs(tx.amount);
      else kpis.aPagar += Math.abs(tx.amount);
    }
  }

  // Free balance = income − expenses (can be negative). Its share of income is
  // null when there is no income, so the UI shows "—" instead of NaN/Infinity.
  kpis.saldoLivre = kpis.totalIncome - kpis.totalExpense;
  kpis.saldoLivrePct =
    kpis.totalIncome > 0 ? (kpis.saldoLivre / kpis.totalIncome) * 100 : null;

  return kpis;
}

/**
 * Net total of a bill selection: income (amount > 0) minus expenses (amount < 0).
 *
 * Summed in integer cents and divided back at the end, so a selection that
 * cancels out returns exactly 0 instead of a float artefact like -1e-14 — which
 * would otherwise render as a red "−R$ 0,00".
 *
 * No `skipped` filtering: skipped rows are already dropped by
 * {@link groupBillsByStatus}, so they never reach a selection. No paid/pending
 * distinction either — if the user ticked it, it counts.
 */
export function selectionTotal(bills: BillViewModel[]): number {
  const cents = bills.reduce((acc, bill) => acc + realsToCents(bill.amount), 0);
  return centsToReals(cents);
}

/* ── Labels + helpers used by UI components ─────────────────────────────── */

/** pt-BR group heading label for each status bucket. */
export const BILL_GROUP_LABELS: Record<BillStatus, string> = {
  overdue:    "Atrasado",
  "due-today":"Vence hoje",
  "this-week":"Esta semana",
  upcoming:   "Próximo",
  paid:       "Confirmado",
  projected:  "Previstas",
};

/**
 * pt-BR label for the confirm-bill CTA, chosen by the transaction's sign:
 * income (amount > 0) is "received", everything else is "paid".
 */
export function payActionLabel(bill: Pick<BillViewModel, "amount">): string {
  return bill.amount > 0 ? "Marcar como recebido" : "Marcar como pago";
}

/** pt-BR status pill text for each bill status. */
export function billStatusLabel(bill: BillViewModel): string {
  switch (bill.status) {
    case "paid":      return bill.amount > 0 ? "Recebido" : "Pago";
    case "overdue":   return "Atrasado";
    case "due-today": return "Hoje";
    case "this-week":
      return bill.daysFromToday === 1
        ? "Em 1 dia"
        : `Em ${bill.daysFromToday} dias`;
    case "upcoming":  return `Em ${bill.daysFromToday} dias`;
    case "projected": return "Prevista";
  }
}

/** Theme tokens for a given bill status pill. */
export function billStatusColors(status: BillStatus): { bg: ColorToken; text: ColorToken } {
  switch (status) {
    case "paid":
      return { bg: "okBg", text: "ok" };
    case "overdue":
      return { bg: "dangerBg", text: "danger" };
    case "due-today":
    case "this-week":
    case "upcoming":
      return { bg: "warnBg", text: "warn" };
    case "projected":
      // Muted / neutral: a history-preview, not a live obligation.
      return { bg: "hair", text: "inkSoft" };
  }
}

function daysText(n: number): string {
  return n === 1 ? "1 dia" : `${n} dias`;
}

/** "dom., 1 nov." from the bill's due date. */
function dueDateShort(bill: BillViewModel): string {
  const [year, mon, day] = bill.dueDate.split("-").map(Number);
  const date = new Date(year, mon - 1, day);
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" });
  const monthShort = date.toLocaleDateString("pt-BR", { month: "short" });
  return `${weekday}, ${day} ${monthShort}`;
}

/**
 * One pt-BR sentence combining the due date and the relative timing, for the
 * mobile details sheet — e.g. "Vence dom., 1 nov. · em 29 dias".
 */
export function billStatusSentence(bill: BillViewModel): string {
  const date = dueDateShort(bill);
  switch (bill.status) {
    case "paid":
      return `${bill.amount > 0 ? "Recebido" : "Pago"} · vencimento ${date}`;
    case "overdue":
      return `Venceu ${date} · atrasado há ${daysText(Math.abs(bill.daysFromToday))}`;
    case "due-today":
      return `Vence hoje, ${date}`;
    case "this-week":
    case "upcoming":
      return `Vence ${date} · em ${daysText(bill.daysFromToday)}`;
    case "projected":
      return `Prevista para ${date}`;
  }
}

/** Theme tokens for the category tile (background + icon), by keyword. */
export function categoryColors(category: string): { bg: ColorToken; text: ColorToken } {
  const key = category.toLowerCase();
  if (key.includes("moradia") || key.includes("aluguel") || key.includes("housing")) {
    return { bg: "catMoradiaBg", text: "catMoradia" };
  }
  if (
    key.includes("conta") || key.includes("internet") || key.includes("energia") ||
    key.includes("água") || key.includes("agua") || key.includes("utility")
  ) {
    return { bg: "catContasBg", text: "catContas" };
  }
  if (
    key.includes("lazer") || key.includes("academia") || key.includes("gym") ||
    key.includes("entretenimento") || key.includes("streaming")
  ) {
    return { bg: "catLazerBg", text: "catLazer" };
  }
  if (
    key.includes("transporte") || key.includes("carro") || key.includes("combustivel") ||
    key.includes("combustível") || key.includes("uber")
  ) {
    return { bg: "catTransporteBg", text: "catTransporte" };
  }
  return { bg: "accentBg", text: "accent" };
}

/** Returns the current month string in YYYY-MM format. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Returns the last N months as YYYY-MM strings, newest last. */
export function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

/**
 * Common expense categories (pt-BR), used as a baseline suggestion set so a
 * fresh household always has categories to pick from before it has saved any
 * of its own. The persisted catalog (GET /api/v1/categories) and month-derived
 * categories are merged on top of these — see {@link mergeCategories}.
 */
export const DEFAULT_CATEGORIES: readonly string[] = [
  "Moradia",
  "Contas",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Lazer",
  "Educação",
  "Outros",
];

/**
 * Merges any number of category lists into one, deduped case-insensitively
 * (first spelling wins) and sorted pt-BR-aware. Used to build the budget
 * picker from the saved catalog ∪ pt-BR defaults ∪ month-derived categories,
 * so the list is never empty for a fresh household while still surfacing the
 * household's own saved categories.
 */
export function mergeCategories(
  ...lists: Array<readonly string[] | undefined>
): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Normalizes a search row into a Transaction so the same derivations apply. */
export function searchRowToTransaction(row: SearchTransactionRow): Transaction {
  return {
    transaction_id: "",
    user_id: "",
    day: row.day,
    category: row.category,
    description: row.description,
    amount: row.amount,
    confirmed: row.confirmed,
    installment: null,
    comment: row.comment,
    group_ids: row.group_ids,
    recurring_rule_id: null,
    skipped: row.skipped,
  };
}
