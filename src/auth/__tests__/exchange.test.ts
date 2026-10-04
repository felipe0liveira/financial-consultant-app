jest.mock("../../config/env", () => ({ env: { bffUrl: "http://bff" } }));
import { exchangeIdToken } from "../exchange";

const ok = { token: "t", expiresAt: "2026-10-11T00:00:00Z", profile: { name: "A", email: "a@b", picture: null } };
const resp = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

test("posts the id token and returns the session", async () => {
  const f = jest.fn().mockResolvedValue(resp(200, ok));
  const r = await exchangeIdToken("id", f);
  expect(f).toHaveBeenCalledWith("http://bff/api/auth/mobile", expect.objectContaining({ method: "POST", body: JSON.stringify({ idToken: "id" }) }));
  expect(r).toEqual({ kind: "ok", session: ok });
});
test("401 is rejected", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockResolvedValue(resp(401, {})))).toEqual({ kind: "rejected" });
});
test("503 is unavailable", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockResolvedValue(resp(503, {})))).toEqual({ kind: "unavailable" });
});
test("thrown fetch is network", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockRejectedValue(new TypeError("Network request failed")))).toEqual({ kind: "network" });
});
test("malformed body is rejected", async () => {
  expect(await exchangeIdToken("id", jest.fn().mockResolvedValue(resp(200, { nope: 1 })))).toEqual({ kind: "rejected" });
});
