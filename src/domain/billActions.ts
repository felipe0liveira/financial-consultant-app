import type { MonthSummary, MonthTransactionsPage, Transaction } from "../api/types";
import { NetworkError, SessionExpiredError } from "../api/client";
import { addMonths } from "./format";

export type BillAction = "pay" | "receive" | "unpay" | "delete" | "deleteSeries";
export type ActionErrorKind = "ambiguous" | "not_found" | "session" | "network" | "other";

/** Fields that identify a bill to the API (spec Q15). */
export interface BillMatch { month: string; description: string; matchDay: number; matchAmount: number }

export function billMatch(tx: Pick<Transaction, "description" | "day" | "amount">, month: string): BillMatch {
  return { month, description: tx.description, matchDay: tx.day, matchAmount: tx.amount };
}

/** Stable key for serialising actions on one bill. */
export function billKey(tx: Pick<Transaction, "description" | "day" | "amount">, month: string): string {
  return `${month}|${tx.description}|${tx.day}|${tx.amount}`;
}

const same = (a: Transaction, m: BillMatch) =>
  a.description === m.description && a.day === m.matchDay && a.amount === m.matchAmount;

/** Returns a copy of `txs` with the matching bill's `confirmed` set. */
export function withConfirmed(txs: Transaction[], m: BillMatch, confirmed: boolean): Transaction[] {
  return txs.map((tx) => (same(tx, m) ? { ...tx, confirmed } : tx));
}

/** Returns a copy of `txs` without the matching bill. */
export function withoutBill(txs: Transaction[], m: BillMatch): Transaction[] {
  return txs.filter((tx) => !same(tx, m));
}

/** Returns a copy of `txs` without every row of an installment series. */
export function withoutSeries(txs: Transaction[], seriesId: string): Transaction[] {
  return txs.filter((tx) => tx.installment?.id !== seriesId);
}

type Pages = { pages: MonthTransactionsPage[]; pageParams: unknown[] };
export function mapPages(data: Pages | undefined, f: (txs: Transaction[]) => Transaction[]): Pages | undefined {
  return data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: f(p.items) })) } : data;
}
export function mapSummary(data: MonthSummary | undefined, f: (txs: Transaction[]) => Transaction[]): MonthSummary | undefined {
  return data ? { ...data, transactions: f(data.transactions ?? []) } : data;
}

/** Maps any action failure to a kind (the BFF reports upstream 409/404 as 500 with the status in the text). */
export function classifyActionError(error: unknown): ActionErrorKind {
  if (error instanceof SessionExpiredError) return "session";
  if (error instanceof NetworkError) return "network";
  const body = (error as { body?: { error?: string } } | null)?.body;
  const text = `${error instanceof Error ? error.message : String(error)} ${body?.error ?? ""}`;
  if (/409|ambiguous/i.test(text)) return "ambiguous";
  if (/404|nothing_matched|not found/i.test(text)) return "not_found";
  if (/401|unauthorized/i.test(text)) return "session";
  return "other";
}

export const OFFLINE_MESSAGE = "Sem conexão. Tente de novo quando estiver online.";

const OTHER: Record<BillAction, string> = {
  pay: "Não foi possível marcar a conta como paga. Tente novamente.",
  receive: "Não foi possível marcar a conta como recebida. Tente novamente.",
  unpay: "Não foi possível desfazer o pagamento. Tente novamente.",
  delete: "Não foi possível excluir a conta. Tente novamente.",
  deleteSeries: "Não foi possível apagar o parcelamento. Tente novamente.",
};

/** pt-BR message for a failed action (spec Q13), web wording where it exists. */
export function actionErrorMessage(action: BillAction, kind: ActionErrorKind): string {
  switch (kind) {
    case "ambiguous": return "Há mais de uma conta parecida. Ajuste os dados e tente de novo.";
    case "not_found":
      return action === "deleteSeries"
        ? "Não encontrei esse parcelamento. Ele pode já ter sido apagado."
        : "Não encontrei essa conta. Ela pode já ter sido removida.";
    case "session": return "Sua sessão expirou. Entre novamente para continuar.";
    case "network": return OFFLINE_MESSAGE;
    case "other": return OTHER[action];
  }
}

/** "outubro/2026" — the web's shortMonthLabel. */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}/${y}`;
}

/** Delete confirmation copy (spec Q8, Q9), ported from the web's use-bill-actions.tsx. */
export function deleteConfirmCopy(
  tx: Pick<Transaction, "description" | "installment">, month: string, currentMonth: string
): { title: string; message: string; seriesId: string | null } {
  const seriesId = tx.installment?.id ?? null;
  if (seriesId && tx.installment) {
    const count = tx.installment.total;
    const firstMonth = addMonths(month, -(tx.installment.current - 1));
    const lastMonth = addMonths(firstMonth, count - 1);
    const paid = firstMonth <= currentMonth ? " — incluindo parcelas já pagas" : "";
    return {
      title: "Excluir parcelamento?",
      message: `As ${count} ${count === 1 ? "parcela" : "parcelas"} de “${tx.description}”, de ${shortMonthLabel(firstMonth)} a ${shortMonthLabel(lastMonth)}, serão apagadas${paid}. Não dá para desfazer.`,
      seriesId,
    };
  }
  return {
    title: "Excluir conta?",
    message: `A conta “${tx.description}” será removida deste mês. Não dá para desfazer.`,
    seriesId: null,
  };
}

/** Which pay-side action applies to a bill. */
export function paySideAction(tx: Pick<Transaction, "confirmed" | "amount">): "pay" | "receive" | "unpay" {
  if (tx.confirmed) return "unpay";
  return tx.amount > 0 ? "receive" : "pay";
}
