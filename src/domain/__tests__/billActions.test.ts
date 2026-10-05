jest.mock("../../config/env", () => ({ env: { bffUrl: "http://bff" } }));

import { ApiError, NetworkError, SessionExpiredError } from "../../api/client";
import type { Transaction } from "../../api/types";
import {
  actionErrorMessage, billMatch, classifyActionError, deleteConfirmCopy, paySideAction,
  shortMonthLabel, withConfirmed, withoutBill, withoutSeries,
} from "../billActions";

const tx = (p: Partial<Transaction> = {}): Transaction => ({
  transaction_id: "t", user_id: "u", day: 10, category: "Contas", description: "Luz", amount: -100,
  confirmed: false, installment: null, comment: null, group_ids: [], recurring_rule_id: null, skipped: false, ...p,
});

test("Q15: match uses description, day and signed amount", () => {
  expect(billMatch(tx(), "2026-10")).toEqual({ month: "2026-10", description: "Luz", matchDay: 10, matchAmount: -100 });
});

test("Q3: confirm only the exact bill", () => {
  const out = withConfirmed([tx(), tx({ day: 11 }), tx({ amount: -50 })], billMatch(tx(), "2026-10"), true);
  expect(out.map((t) => t.confirmed)).toEqual([true, false, false]);
});

test("Q11: remove only the exact bill; series removal by id", () => {
  expect(withoutBill([tx(), tx({ day: 11 })], billMatch(tx(), "2026-10"))).toHaveLength(1);
  const s = { current: 1, total: 3, id: "s1" };
  expect(withoutSeries([tx({ installment: s }), tx()], "s1")).toHaveLength(1);
});

test("Q13: error classification", () => {
  expect(classifyActionError(new SessionExpiredError())).toBe("session");
  expect(classifyActionError(new NetworkError())).toBe("network");
  expect(classifyActionError(new ApiError("x", 500, { error: "API request to transactions failed: 409 Conflict" }))).toBe("ambiguous");
  expect(classifyActionError(new ApiError("x", 500, { error: "API request to transactions failed: 404 Not Found" }))).toBe("not_found");
  expect(classifyActionError(new ApiError("x", 500, { error: "boom" }))).toBe("other");
});

test("Q13: messages", () => {
  expect(actionErrorMessage("pay", "ambiguous")).toBe("Há mais de uma conta parecida. Ajuste os dados e tente de novo.");
  expect(actionErrorMessage("deleteSeries", "not_found")).toBe("Não encontrei esse parcelamento. Ele pode já ter sido apagado.");
  expect(actionErrorMessage("pay", "network")).toBe("Sem conexão. Tente de novo quando estiver online.");
});

test("Q8: single delete copy", () => {
  expect(deleteConfirmCopy(tx(), "2026-10", "2026-10")).toEqual({
    title: "Excluir conta?",
    message: "A conta “Luz” será removida deste mês. Não dá para desfazer.",
    seriesId: null,
  });
});

test("Q9: series delete copy with paid parcels", () => {
  const c = deleteConfirmCopy(tx({ description: "PC", installment: { current: 13, total: 18, id: "s" } }), "2026-10", "2026-10");
  expect(c.title).toBe("Excluir parcelamento?");
  expect(c.message).toBe(
    `As 18 parcelas de “PC”, de ${shortMonthLabel("2025-10")} a ${shortMonthLabel("2027-03")}, serão apagadas — incluindo parcelas já pagas. Não dá para desfazer.`
  );
  expect(c.seriesId).toBe("s");
});

test("legacy installment without id uses single copy", () => {
  expect(deleteConfirmCopy(tx({ installment: { current: 1, total: 2 } }), "2026-10", "2026-10").title).toBe("Excluir conta?");
});

test("pay side action", () => {
  expect(paySideAction(tx())).toBe("pay");
  expect(paySideAction(tx({ amount: 10 }))).toBe("receive");
  expect(paySideAction(tx({ confirmed: true }))).toBe("unpay");
});
