import { shouldShowRefreshNotice } from "../status";

test("F4: refresh notice only after 400 ms of a background refresh with data", () => {
  expect(shouldShowRefreshNotice(true, true, 401)).toBe(true);
  expect(shouldShowRefreshNotice(true, true, 399)).toBe(false);
  expect(shouldShowRefreshNotice(true, false, 1000)).toBe(false);
  expect(shouldShowRefreshNotice(false, true, 1000)).toBe(false);
});
