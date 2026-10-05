import type { Transaction } from "../../api/types";
import { billStatusLabel, deriveContasKpis, toBillViewModels } from "../../domain/bills";
import { addMonths } from "../../domain/format";

/** The "mês quitado" figures (spec 5–7). */
export interface SettledSummary {
  /** Total paid in expenses (positive). */
  paidAmount: number;
  /** Number of paid expenses. */
  paidCount: number;
  /** Received minus paid; negative when paid exceeds received. */
  result: number;
  /** Income not yet received (positive); 0 when none. */
  pendingIncome: number;
}

/**
 * Null unless the month has at least one expense and every expense is confirmed (spec 1–3).
 * Pending income does not block the settled state.
 */
export function deriveSettled(transactions: Transaction[], month: string, today: Date): SettledSummary | null {
  const expenses = transactions.filter((t) => !t.skipped && t.amount < 0);
  if (expenses.length === 0 || expenses.some((t) => !t.confirmed)) return null;
  const k = deriveContasKpis(transactions, month, today);
  return { paidAmount: k.pago, paidCount: expenses.length, result: k.recebido - k.pago, pendingIncome: k.aReceber };
}

/** "Outubro" — capitalized pt-BR month name of a YYYY-MM key. */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The month after `month` (December → January of the next year). */
export function nextMonthOf(month: string): string {
  return addMonths(month, 1);
}

/** Spec 6: "Sobrou no mês" for ≥ 0, "Faltou no mês" (positive amount, alert) for < 0. */
export function monthResultLine(result: number): { label: string; amount: number; negative: boolean } {
  return result < 0
    ? { label: "Faltou no mês", amount: Math.abs(result), negative: true }
    : { label: "Sobrou no mês", amount: result, negative: false };
}

export interface NextMonthPreview {
  month: string;
  /** Total of the month's unpaid expenses (positive). */
  toPay: number;
  /** Earliest-due unpaid expense, or null when nothing is left to pay. */
  next: { description: string; when: string } | null;
}

/** Spec 8: what the next month still has to pay, and which bill comes first. */
export function deriveNextMonthPreview(transactions: Transaction[], month: string, today: Date): NextMonthPreview {
  const unpaid = toBillViewModels(transactions, month, today).filter((b) => b.amount < 0 && !b.confirmed);
  const toPay = unpaid.reduce((s, b) => s + Math.abs(b.amount), 0);
  const first = unpaid[0];
  const label = first ? billStatusLabel(first) : "";
  return {
    month,
    toPay,
    next: first ? { description: first.description, when: label.charAt(0).toLowerCase() + label.slice(1) } : null,
  };
}
