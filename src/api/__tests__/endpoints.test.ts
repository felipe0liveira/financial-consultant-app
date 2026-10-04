jest.mock("../client", () => ({ apiFetch: jest.fn().mockResolvedValue({}) }));
import { apiFetch } from "../client";
import { getGroups, getMonth, getMonthTransactions, searchTransactions } from "../endpoints";

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
