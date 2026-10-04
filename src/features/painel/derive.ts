import type { MonthSummary, Transaction } from "../../api/types";
import type { BillGroup, BillViewModel } from "../../domain/bills";

const sumOutflow = (bills: { amount: number }[]) => bills.reduce((s, b) => s + (b.amount < 0 ? b.amount : 0), 0);

export interface PainelKpis {
  totalExpenses: number;
  totalBills: number;
  paidAmount: number;
  paidBills: number;
  unpaidAmount: number;
  overdueAmount: number;
  overdueBills: number;
  pendingCount: number;
}

/** KPI figures exactly as the web dashboard computes them (paid/unpaid count expenses only). */
export function derivePainelKpis(groups: BillGroup[], summary: MonthSummary | undefined): PainelKpis {
  const overdue = groups.find((g) => g.status === "overdue");
  return {
    totalExpenses: Math.abs(summary?.overview?.total_expenses ?? 0),
    totalBills: groups.reduce((s, g) => s + g.bills.length, 0),
    paidAmount: Math.abs(groups.filter((g) => g.status === "paid").reduce((s, g) => s + sumOutflow(g.bills), 0)),
    paidBills: groups.find((g) => g.status === "paid")?.bills.length ?? 0,
    unpaidAmount: Math.abs(groups.filter((g) => g.status !== "paid").reduce((s, g) => s + sumOutflow(g.bills), 0)),
    overdueAmount: Math.abs(overdue ? sumOutflow(overdue.bills) : 0),
    overdueBills: overdue?.bills.length ?? 0,
    pendingCount: groups.filter((g) => g.status !== "paid").reduce((s, g) => s + g.bills.length, 0),
  };
}

/** "Próximos vencimentos": up to 4 unpaid bills (every non-paid status), soonest day first. */
export function upcomingBills(groups: BillGroup[], limit = 4): BillViewModel[] {
  return groups
    .filter((g) => g.status !== "paid")
    .flatMap((g) => g.bills)
    .sort((a, b) => a.day - b.day)
    .slice(0, limit);
}

/**
 * "Por categoria": |amount| of every transaction per category (income included, no `skipped`
 * filter — the web does neither), zero totals dropped, top 6 descending.
 */
export function categoryTotals(transactions: Transaction[], limit = 6): { name: string; value: number }[] {
  const totals: Record<string, number> = {};
  for (const tx of transactions) {
    totals[tx.category] = (totals[tx.category] ?? 0) + Math.abs(tx.amount);
  }
  return Object.entries(totals)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Chart series: expense magnitude per month, 0 while a month has not loaded. */
export function expenseSeries(summaries: (MonthSummary | undefined)[]): number[] {
  return summaries.map((s) => Math.abs(s?.overview?.total_expenses ?? 0));
}
