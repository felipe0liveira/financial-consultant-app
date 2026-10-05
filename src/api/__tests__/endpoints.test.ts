jest.mock("../client", () => ({ apiFetch: jest.fn().mockResolvedValue({}) }));
import { apiFetch } from "../client";
import {
  deleteInstallmentSeries,
  deleteTransaction,
  getGroups,
  getMonth,
  getMonthTransactions,
  searchTransactions,
  setTransactionConfirmed,
} from "../endpoints";

const calls = () => (apiFetch as jest.Mock).mock.calls.map((c) => c[0]);
beforeEach(() => (apiFetch as jest.Mock).mockClear());

test("paths match the BFF routes", async () => {
  await getMonth("2026-10");
  await getMonthTransactions("2026-10", null);
  await getMonthTransactions("2026-10", "50");
  await searchTransactions({ month: "2026-10", description: "luz" });
  await getGroups();
  expect(calls()).toEqual([
    "months/2026-10",
    "months/2026-10/transactions",
    "months/2026-10/transactions?cursor=50",
    "transactions/search?description=luz&month=2026-10",
    "groups",
  ]);
});

test("write routes and bodies", async () => {
  const m = { month: "2026-10", description: "Luz", matchDay: 10, matchAmount: -100 };
  await setTransactionConfirmed(m, true);
  await deleteTransaction(m);
  await deleteInstallmentSeries("s 1");
  const c = (apiFetch as jest.Mock).mock.calls;
  expect(c[0]).toEqual(["transactions", { method: "PATCH", body: JSON.stringify({ ...m, confirmed: true }) }]);
  expect(c[1]).toEqual(["transactions", { method: "DELETE", body: JSON.stringify(m) }]);
  expect(c[2]).toEqual(["installments/s%201", { method: "DELETE" }]);
});
