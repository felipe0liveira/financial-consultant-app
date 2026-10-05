import type { Transaction } from "../../../api/types";
import { deriveNextMonthPreview, deriveSettled, monthName, monthResultLine, nextMonthOf } from "../settled";

const today = new Date(2026, 9, 5);
const tx = (p: Partial<Transaction>): Transaction => ({
  transaction_id: "t", user_id: "u", day: 10, category: "Contas", description: "x", amount: -100,
  confirmed: false, installment: null, comment: null, group_ids: [], recurring_rule_id: null, skipped: false, ...p,
});

describe("deriveSettled", () => {
  test("all expenses paid → settled, with paid total, count and result", () => {
    const s = deriveSettled([tx({ amount: -100, confirmed: true }), tx({ amount: -50, confirmed: true }), tx({ amount: 400, confirmed: true })], "2026-10", today);
    expect(s).toEqual({ paidAmount: 150, paidCount: 2, result: 250, pendingIncome: 0 });
  });
  test("one unpaid expense → not settled", () => {
    expect(deriveSettled([tx({ confirmed: true }), tx({ confirmed: false })], "2026-10", today)).toBeNull();
  });
  test("unpaid virtual (projected) expense → not settled", () => {
    expect(deriveSettled([tx({ confirmed: true }), tx({ transaction_id: null, day: 1 })], "2026-10", today)).toBeNull();
  });
  test("no expenses → not settled", () => {
    expect(deriveSettled([tx({ amount: 500, confirmed: true })], "2026-10", today)).toBeNull();
    expect(deriveSettled([], "2026-10", today)).toBeNull();
  });
  test("pending income does not block, and is reported", () => {
    const s = deriveSettled([tx({ amount: -100, confirmed: true }), tx({ amount: 300, confirmed: false })], "2026-10", today);
    expect(s).toMatchObject({ pendingIncome: 300, result: -100 });
  });
  test("skipped rows are ignored", () => {
    expect(deriveSettled([tx({ confirmed: true }), tx({ confirmed: false, skipped: true })], "2026-10", today)).toMatchObject({ paidCount: 1 });
  });
});

test("Sobrou / Faltou", () => {
  expect(monthResultLine(250)).toEqual({ label: "Sobrou no mês", amount: 250, negative: false });
  expect(monthResultLine(0)).toEqual({ label: "Sobrou no mês", amount: 0, negative: false });
  expect(monthResultLine(-300)).toEqual({ label: "Faltou no mês", amount: 300, negative: true });
});

test("month names and December rollover", () => {
  expect(monthName("2026-10")).toBe("Outubro");
  expect(nextMonthOf("2026-10")).toBe("2026-11");
  expect(nextMonthOf("2026-12")).toBe("2027-01");
});

describe("deriveNextMonthPreview", () => {
  test("total to pay and earliest unpaid expense", () => {
    const p = deriveNextMonthPreview(
      [tx({ day: 15, description: "Luz", amount: -80 }), tx({ day: 1, description: "Cartão", amount: -900 }), tx({ day: 2, amount: -20, confirmed: true }), tx({ day: 1, amount: 5000 })],
      "2026-11", today
    );
    expect(p.toPay).toBe(980);
    expect(p.next).toEqual({ description: "Cartão", when: "em 27 dias" });
  });
  test("nothing left to pay", () => {
    expect(deriveNextMonthPreview([tx({ confirmed: true })], "2026-11", today)).toEqual({ month: "2026-11", toPay: 0, next: null });
  });
});
