import { addMonths, formatBRL, formatBRL0, formatMonthLong, formatPct } from "../format";

// Intl emits NBSP / narrow NBSP between the symbol and the number; normalize to a plain space.
const norm = (s: string) => s.replace(/[  ]/g, " ");

test("BRL with and without decimals", () => {
  expect(norm(formatBRL(1234.5))).toBe("R$ 1.234,50");
  expect(norm(formatBRL0(1234.5))).toBe("R$ 1.235");
});
test("month label", () => expect(formatMonthLong("2026-09")).toBe("Setembro de 2026"));
test("addMonths across years", () => {
  expect(addMonths("2026-12", 1)).toBe("2027-01");
  expect(addMonths("2026-01", -1)).toBe("2025-12");
});
test("percent", () => expect(formatPct(12.345)).toBe("12,3%"));
