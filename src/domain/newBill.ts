import { NetworkError, SessionExpiredError } from "../api/client";
import type { BillDirection, CreateBillInput } from "../api/types";
import { OFFLINE_MESSAGE } from "./billActions";
import { centsToReals } from "./money";

/** A trailing installment marker found in a bill title (ported from the web's add-bill-form). */
export interface ParsedInstallment { clean: string; current: number; total: number }

/**
 * "Passagens aéreas 3/5" → { clean: "Passagens aéreas", current: 3, total: 5 }.
 * Only a whitespace-preceded marker at the very end counts; requires 1 ≤ N ≤ M, M ≥ 2 and a
 * non-empty title — otherwise the description is taken verbatim (spec 11, 12).
 */
export function parseInstallment(value: string): ParsedInstallment | null {
  const match = value.match(/\s(\d{1,3})\s*\/\s*(\d{1,3})\s*$/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (total < 2 || current < 1 || current > total) return null;
  const clean = value.slice(0, match.index).trim();
  if (!clean) return null;
  return { clean, current, total };
}

export interface NewBillForm {
  category: string;
  description: string;
  direction: BillDirection;
  /** Integer cents; null = empty field. */
  cents: number | null;
  date: Date;
  recurring: boolean;
  backfillPaid: boolean;
}

export const DEFAULT_NEW_BILL_CATEGORY = "Contas";

/** "2026-10" for a local date. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Local midnight of the 1st of a "YYYY-MM" month. */
export function firstOfMonth(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** Defaults (spec 4–10): Contas, Saída, empty value, the 1st of `month`, switches off. */
export function initialNewBillForm(month: string): NewBillForm {
  return {
    category: DEFAULT_NEW_BILL_CATEGORY,
    description: "",
    direction: "out",
    cents: null,
    date: firstOfMonth(month),
    recurring: false,
    backfillPaid: false,
  };
}

/** "Já venho pagando desde então" is offered only for a recurring, non-installment, past start month (spec 10). */
export function canBackfill(form: NewBillForm, currentMonth: string): boolean {
  return form.recurring && !parseInstallment(form.description) && monthKey(form.date) < currentMonth;
}

/** Applies a change and drops a backfill choice that is no longer offered (spec 10, edge cases). */
export function updateNewBillForm(form: NewBillForm, patch: Partial<NewBillForm>, currentMonth: string): NewBillForm {
  const next = { ...form, ...patch };
  if (!canBackfill(next, currentMonth)) next.backfillPaid = false;
  return next;
}

/** True when anything differs from the form's initial state (spec 18). */
export function isNewBillDirty(form: NewBillForm, initial: NewBillForm): boolean {
  return (
    form.category !== initial.category ||
    form.description !== initial.description ||
    form.direction !== initial.direction ||
    form.cents !== initial.cents ||
    form.date.getTime() !== initial.date.getTime() ||
    form.recurring !== initial.recurring ||
    form.backfillPaid !== initial.backfillPaid
  );
}

/** The web's validation copy (spec 14); null when the form can be saved. */
export function validateNewBill(form: NewBillForm): string | null {
  const parsed = parseInstallment(form.description);
  const description = parsed ? parsed.clean : form.description.trim();
  if (!description) return "Informe uma descrição para a conta.";
  if (form.cents === null || form.cents <= 0) return "Informe um valor válido maior que zero.";
  return null;
}

/** The POST /transactions body for a validated form — the web's handleSubmit (spec 10, 11). */
export function buildCreateBillInput(form: NewBillForm, currentMonth: string): CreateBillInput {
  const parsed = parseInstallment(form.description);
  const recurring = parsed ? false : form.recurring;
  return {
    month: monthKey(form.date),
    day: form.date.getDate(),
    category: form.category,
    description: parsed ? parsed.clean : form.description.trim(),
    amount: centsToReals(form.cents ?? 0),
    direction: form.direction,
    recurring,
    installmentCurrent: parsed?.current,
    installmentTotal: parsed?.total,
    installmentBackfillPaid: parsed ? true : undefined,
    recurringBackfillPaid: recurring ? canBackfill(form, currentMonth) && form.backfillPaid : undefined,
  };
}

/** Success toast (spec 16): installment wins, then Entrada, else Conta. */
export function createdMessage(input: CreateBillInput): string {
  if (input.installmentTotal !== undefined) return "Parcelamento criado";
  return input.direction === "in" ? "Entrada criada" : "Conta criada";
}

/** "05/10/2026". */
export function formatDateBR(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** "Repete todo dia 5, a partir de outubro de 2026." (spec 9). */
export function recurringHint(date: Date): string {
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `Repete todo dia ${date.getDate()}, a partir de ${month} de ${date.getFullYear()}.`;
}

/** The web's installment hint (spec 11). */
export function installmentHint(p: ParsedInstallment): string {
  return `Detectamos ${p.total} parcelas em “${p.clean}” — vamos cadastrar da 1 à ${p.total} (a ${p.current}ª é a atual). O valor é por parcela.`;
}

/** Existing category with the same name ignoring case, if any (spec 13). */
export function findCategory(options: readonly string[], name: string): string | null {
  const key = name.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === key) ?? null;
}

export const DUPLICATE_BILL_MESSAGE = "Já existe uma conta igual neste mês. Ajuste os dados ou tente novamente.";
const SESSION_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";

function errorText(error: unknown): string {
  const body = (error as { body?: { error?: string } } | null)?.body;
  return `${error instanceof Error ? error.message : String(error)} ${body?.error ?? ""}`;
}

/** pt-BR copy for a failed create (spec 17, duplicate edge case) — the web's toPtBrMessage. */
export function createBillErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE_MESSAGE;
  if (error instanceof SessionExpiredError) return SESSION_MESSAGE;
  const text = errorText(error);
  if (/409|duplicate/i.test(text)) return DUPLICATE_BILL_MESSAGE;
  if (/401|unauthorized/i.test(text)) return SESSION_MESSAGE;
  return "Não foi possível criar a conta. Tente novamente.";
}

/** pt-BR copy for a failed category creation — the web's use-categories wording. */
export function categoryErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE_MESSAGE;
  if (error instanceof SessionExpiredError) return SESSION_MESSAGE;
  return "Não foi possível salvar a categoria. Tente novamente.";
}
