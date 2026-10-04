import { resolveScheme } from "../tokens";

test("system follows the OS", () => {
  expect(resolveScheme("system", "dark")).toBe("dark");
  expect(resolveScheme("system", "light")).toBe("light");
  expect(resolveScheme("system", null)).toBe("light");
});

test("explicit preference wins over the OS", () => {
  expect(resolveScheme("light", "dark")).toBe("light");
  expect(resolveScheme("dark", "light")).toBe("dark");
});
