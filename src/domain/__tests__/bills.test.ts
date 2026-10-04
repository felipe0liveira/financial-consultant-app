import type { Transaction } from "../../api/types";
import {
  billStatusSentence, bucketBills, deriveContasKpis, filterBills, groupBillsByStatus,
  lastNMonths, toBillViewModels,
} from "../bills";

const today = new Date(2026, 9, 10); // 2026-10-10, local time
const tx = (p: Partial<Transaction>): Transaction => ({
  transaction_id: "t", user_id: "u", day: 10, category: "Contas", description: "Luz",
  amount: -100, confirmed: false, installment: null, comment: null, group_ids: [],
  recurring_rule_id: null, skipped: false, ...p,
});
const status = (p: Partial<Transaction>) => toBillViewModels([tx(p)], "2026-10", today)[0]?.status;

test("S1: status derivation", () => {
  expect(status({ confirmed: true })).toBe("paid");
  expect(status({ day: 5 })).toBe("overdue");
  expect(status({ day: 5, transaction_id: null })).toBe("projected");
  expect(status({ day: 10 })).toBe("due-today");
  expect(status({ day: 17 })).toBe("this-week");
  expect(status({ day: 18 })).toBe("upcoming");
});

test("S2: skipped rows are hidden", () => {
  expect(toBillViewModels([tx({ skipped: true })], "2026-10", today)).toHaveLength(0);
});

test("C5: status buckets follow the web order", () => {
  const bills = toBillViewModels(
    [tx({ day: 20, description: "a" }), tx({ day: 5, description: "b" }), tx({ confirmed: true, description: "c" }), tx({ day: 10, description: "d" })],
    "2026-10", today
  );
  expect(bucketBills(bills, "status", []).map((b) => b.key)).toEqual([
    "status:overdue", "status:due-today", "status:upcoming", "status:paid",
  ]);
});

test("C5: group mode puts ungrouped bills last without a heading", () => {
  const bills = toBillViewModels([tx({ group_ids: ["g1"] }), tx({ description: "x" })], "2026-10", today);
  const buckets = bucketBills(bills, "group", [{ group_id: "g1", name: "Casa", color: "coral", member_count: 1 }]);
  expect(buckets[0].label).toBe("Casa");
  expect(buckets[buckets.length - 1].label).toBeNull();
});

test("C4: filters by status and category", () => {
  const txs = [tx({ day: 5 }), tx({ confirmed: true, category: "Lazer" })];
  expect(filterBills(txs, { status: "paid", category: "all" }, "2026-10", today)).toHaveLength(1);
  expect(filterBills(txs, { status: "all", category: "Lazer" }, "2026-10", today)).toHaveLength(1);
});

test("C2: contas KPIs", () => {
  const k = deriveContasKpis(
    [tx({ amount: 1000, confirmed: true }), tx({ amount: -300 }), tx({ amount: -200, confirmed: true })],
    "2026-10", today
  );
  expect(k.recebido).toBe(1000);
  expect(k.aPagar).toBe(300);
  expect(k.pago).toBe(200);
  expect(k.saldoLivre).toBe(500);
  expect(k.saldoLivrePct).toBe(50);
  expect(deriveContasKpis([tx({ amount: -1 })], "2026-10", today).saldoLivrePct).toBeNull();
});

test("Painel groups unpaid bills by status", () => {
  const groups = groupBillsByStatus([tx({ day: 5 }), tx({ confirmed: true })], "2026-10", today);
  expect(groups.map((g) => g.status)).toEqual(["overdue", "paid"]);
});

test("D1: status sentence", () => {
  const [b] = toBillViewModels([tx({ day: 5 })], "2026-10", today);
  expect(billStatusSentence(b)).toMatch(/^Venceu .* · atrasado há 5 dias$/);
});

test("lastNMonths is oldest first", () => {
  expect(lastNMonths(3)).toHaveLength(3);
});
