import { displayName, initials, isExpired, needsRenewal, type StoredSession } from "../session";

const H = 60 * 60 * 1000;
const now = Date.parse("2026-10-04T12:00:00Z");
const at = (ms: number): StoredSession => ({
  token: "t",
  expiresAt: new Date(now + ms).toISOString(),
  profile: { name: "Ana Souza", email: "a@b.c", picture: null },
});

test("renews when expired", () => expect(needsRenewal(at(-1), now)).toBe(true));
test("renews within 24h", () => expect(needsRenewal(at(23 * H), now)).toBe(true));
test("does not renew beyond 24h", () => expect(needsRenewal(at(25 * H), now)).toBe(false));
test("invalid expiry renews", () =>
  expect(needsRenewal({ ...at(0), expiresAt: "nope" }, now)).toBe(true));
test("isExpired", () => {
  expect(isExpired(at(-1), now)).toBe(true);
  expect(isExpired(at(H), now)).toBe(false);
});
test("initials", () => {
  expect(initials("Ana Souza")).toBe("AS");
  expect(initials("ana")).toBe("A");
  expect(initials("  ")).toBe("U");
});
test("displayName falls back to Usuário", () =>
  expect(displayName({ name: " ", email: "", picture: null })).toBe("Usuário"));
