import type { Transaction } from "../../../api/types";
import { groupBillsByStatus } from "../../../domain/bills";
import { categoryTotals, derivePainelKpis, upcomingBills } from "../derive";

const today = new Date(2026, 9, 10);
const tx = (p: Partial<Transaction>): Transaction => ({
  transaction_id: "t", user_id: "u", day: 20, category: "Contas", description: "x", amount: -100,
  confirmed: false, installment: null, comment: null, group_ids: [], recurring_rule_id: null, skipped: false, ...p,
});

test("P2: paid/unpaid count expenses only", () => {
  const txs = [tx({ amount: -100, confirmed: true }), tx({ amount: 500, confirmed: true }), tx({ amount: -50, day: 5 })];
  const k = derivePainelKpis(groupBillsByStatus(txs, "2026-10", today), undefined);
  expect(k.paidAmount).toBe(100);
  expect(k.unpaidAmount).toBe(50);
  expect(k.overdueBills).toBe(1);
});

test("P5: up to 4 upcoming, soonest first", () => {
  const txs = [25, 12, 30, 15, 18].map((day, i) => tx({ day, description: `b${i}` }));
  expect(upcomingBills(groupBillsByStatus(txs, "2026-10", today)).map((b) => b.day)).toEqual([12, 15, 18, 25]);
});

test("P6: top categories by absolute amount", () => {
  const out = categoryTotals([tx({ category: "A", amount: -10 }), tx({ category: "B", amount: 30 }), tx({ category: "A", amount: -5 })]);
  expect(out).toEqual([{ name: "B", value: 30 }, { name: "A", value: 15 }]);
});

test("P6: zero-total categories are dropped and the list is capped at 6", () => {
  const txs = ["A", "B", "C", "D", "E", "F", "G"].map((c, i) => tx({ category: c, amount: -(i + 1) }));
  const out = categoryTotals([...txs, tx({ category: "Z", amount: 0 })]);
  expect(out).toHaveLength(6);
  expect(out.map((d) => d.name)).not.toContain("Z");
});
