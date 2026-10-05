jest.mock("../../config/env", () => ({ env: { bffUrl: "http://bff" } }));

import { ApiError, NetworkError, SessionExpiredError } from "../../api/client";
import { OFFLINE_MESSAGE } from "../billActions";
import {
  buildCreateBillInput, canBackfill, categoryErrorMessage, createBillErrorMessage, createdMessage,
  DUPLICATE_BILL_MESSAGE, findCategory, formatDateBR, initialNewBillForm, installmentHint, isNewBillDirty,
  parseInstallment, recurringHint, updateNewBillForm, validateNewBill, type NewBillForm,
} from "../newBill";

const NOW = "2026-10";
const form = (patch: Partial<NewBillForm> = {}): NewBillForm => ({ ...initialNewBillForm("2026-10"), ...patch });

describe("parseInstallment", () => {
  test("detects a trailing N/M", () => {
    expect(parseInstallment("Passagens aéreas 3/5")).toEqual({ clean: "Passagens aéreas", current: 3, total: 5 });
    expect(parseInstallment("Sofá 1 / 10 ")).toEqual({ clean: "Sofá", current: 1, total: 10 });
  });
  test.each(["1/2 kg de arroz", "3/5", "Compra 6/5", "Compra 1/1", "Compra 0/3", "Compra3/5"])("ignores %s", (v) => {
    expect(parseInstallment(v)).toBeNull();
  });
});

test("initial form defaults", () => {
  const f = initialNewBillForm("2026-08");
  expect(f).toMatchObject({ category: "Contas", description: "", direction: "out", cents: null, recurring: false, backfillPaid: false });
  expect(formatDateBR(f.date)).toBe("01/08/2026");
});

describe("backfill rule", () => {
  test("only for recurring + no marker + past month", () => {
    expect(canBackfill(form({ recurring: true, date: new Date(2026, 7, 5) }), NOW)).toBe(true);
    expect(canBackfill(form({ recurring: false, date: new Date(2026, 7, 5) }), NOW)).toBe(false);
    expect(canBackfill(form({ recurring: true, date: new Date(2026, 9, 5) }), NOW)).toBe(false);
    expect(canBackfill(form({ recurring: true, date: new Date(2026, 7, 5), description: "Curso 2/6" }), NOW)).toBe(false);
  });
  test("is dropped when no longer offered, recurring is kept", () => {
    const armed = form({ recurring: true, backfillPaid: true, date: new Date(2026, 7, 5) });
    expect(updateNewBillForm(armed, { date: new Date(2026, 10, 5) }, NOW).backfillPaid).toBe(false);
    expect(updateNewBillForm(armed, { recurring: false }, NOW).backfillPaid).toBe(false);
    const marked = updateNewBillForm(armed, { description: "Curso 2/6" }, NOW);
    expect(marked).toMatchObject({ backfillPaid: false, recurring: true });
    expect(updateNewBillForm(marked, { description: "Curso" }, NOW)).toMatchObject({ backfillPaid: false, recurring: true });
    expect(updateNewBillForm(form(), { backfillPaid: true }, NOW).backfillPaid).toBe(false);
  });
});

test("dirty detection", () => {
  const initial = initialNewBillForm("2026-10");
  expect(isNewBillDirty({ ...initial }, initial)).toBe(false);
  expect(isNewBillDirty({ ...initial, date: new Date(initial.date) }, initial)).toBe(false);
  expect(isNewBillDirty({ ...initial, description: "x" }, initial)).toBe(true);
  expect(isNewBillDirty({ ...initial, cents: 100 }, initial)).toBe(true);
  expect(isNewBillDirty({ ...initial, date: new Date(2026, 9, 2) }, initial)).toBe(true);
});

test("validation copy", () => {
  expect(validateNewBill(form({ description: "  ", cents: 100 }))).toBe("Informe uma descrição para a conta.");
  expect(validateNewBill(form({ description: "Luz", cents: null }))).toBe("Informe um valor válido maior que zero.");
  expect(validateNewBill(form({ description: "Luz", cents: 0 }))).toBe("Informe um valor válido maior que zero.");
  expect(validateNewBill(form({ description: "Luz", cents: 100 }))).toBeNull();
});

describe("request body", () => {
  test("one-off expense", () => {
    expect(buildCreateBillInput(form({ description: " Luz ", cents: 12050, date: new Date(2026, 9, 10) }), NOW)).toEqual({
      month: "2026-10", day: 10, category: "Contas", description: "Luz", amount: 120.5, direction: "out", recurring: false,
      installmentCurrent: undefined, installmentTotal: undefined, installmentBackfillPaid: undefined, recurringBackfillPaid: undefined,
    });
  });
  test("income", () => {
    expect(buildCreateBillInput(form({ description: "Salário", cents: 500000, direction: "in" }), NOW)).toMatchObject({ direction: "in", amount: 5000 });
  });
  test("recurring with and without backfill", () => {
    const past = form({ description: "Aluguel", cents: 100, recurring: true, date: new Date(2026, 7, 5) });
    expect(buildCreateBillInput({ ...past, backfillPaid: true }, NOW)).toMatchObject({ month: "2026-08", recurring: true, recurringBackfillPaid: true });
    expect(buildCreateBillInput(past, NOW)).toMatchObject({ recurring: true, recurringBackfillPaid: false });
  });
  test("installment wins over recurring", () => {
    expect(buildCreateBillInput(form({ description: "Passagens aéreas 3/5", cents: 100, recurring: true }), NOW)).toMatchObject({
      description: "Passagens aéreas", recurring: false, installmentCurrent: 3, installmentTotal: 5,
      installmentBackfillPaid: true, recurringBackfillPaid: undefined,
    });
  });
});

test("success titles", () => {
  const base = buildCreateBillInput(form({ description: "Luz", cents: 1 }), NOW);
  expect(createdMessage(base)).toBe("Conta criada");
  expect(createdMessage({ ...base, direction: "in" })).toBe("Entrada criada");
  expect(createdMessage({ ...base, direction: "in", installmentTotal: 5, installmentCurrent: 1 })).toBe("Parcelamento criado");
});

test("hints", () => {
  expect(recurringHint(new Date(2026, 9, 5))).toBe("Repete todo dia 5, a partir de outubro de 2026.");
  expect(installmentHint({ clean: "Passagens aéreas", current: 3, total: 5 })).toBe(
    "Detectamos 5 parcelas em “Passagens aéreas” — vamos cadastrar da 1 à 5 (a 3ª é a atual). O valor é por parcela."
  );
});

test("findCategory ignores case", () => {
  expect(findCategory(["Contas", "Lazer"], " lazer ")).toBe("Lazer");
  expect(findCategory(["Contas"], "Pets")).toBeNull();
});

test("error copy", () => {
  expect(createBillErrorMessage(new ApiError("API transactions failed: 500", 500, { error: "API error 409: duplicate" }))).toBe(DUPLICATE_BILL_MESSAGE);
  expect(createBillErrorMessage(new NetworkError())).toBe(OFFLINE_MESSAGE);
  expect(createBillErrorMessage(new SessionExpiredError())).toBe("Sua sessão expirou. Entre novamente para continuar.");
  expect(createBillErrorMessage(new ApiError("API transactions failed: 500", 500, { error: "boom" }))).toBe("Não foi possível criar a conta. Tente novamente.");
  expect(categoryErrorMessage(new ApiError("x", 500))).toBe("Não foi possível salvar a categoria. Tente novamente.");
  expect(categoryErrorMessage(new NetworkError())).toBe(OFFLINE_MESSAGE);
});
