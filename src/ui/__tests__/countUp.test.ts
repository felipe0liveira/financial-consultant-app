import { countUpValue } from "../countUp";

test("count-up starts at 0 and ends at the target", () => {
  expect(countUpValue(100, 0)).toBe(0);
  expect(countUpValue(100, 600)).toBe(100);
  expect(countUpValue(100, 9999)).toBe(100);
  expect(countUpValue(100, 300)).toBeGreaterThan(50);
});
