jest.mock("../../config/env", () => ({ env: { bffUrl: "http://bff" } }));
import { apiFetch, installAuthHooks, NetworkError, SessionExpiredError } from "../client";

const resp = (status: number, body: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

function setup(renewTo: string | null) {
  const h = { getToken: () => "old", renew: jest.fn().mockResolvedValue(renewTo), onExpired: jest.fn() };
  installAuthHooks(h);
  return h;
}

test("sends the bearer and returns json", async () => {
  setup("new");
  const f = jest.fn().mockResolvedValue(resp(200, { user_id: "u1" }));
  await expect(apiFetch("me", {}, f)).resolves.toEqual({ user_id: "u1" });
  expect(f.mock.calls[0][0]).toBe("http://bff/api/v1/me");
  expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer old");
});

test("401 → renew once → retry with the new token", async () => {
  const h = setup("new");
  const f = jest.fn().mockResolvedValueOnce(resp(401)).mockResolvedValueOnce(resp(200, { ok: 1 }));
  await expect(apiFetch("me", {}, f)).resolves.toEqual({ ok: 1 });
  expect(h.renew).toHaveBeenCalledTimes(1);
  expect(f.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
});

test("renewal failure signs out", async () => {
  const h = setup(null);
  const f = jest.fn().mockResolvedValue(resp(401));
  await expect(apiFetch("me", {}, f)).rejects.toBeInstanceOf(SessionExpiredError);
  expect(h.onExpired).toHaveBeenCalled();
});

test("second 401 signs out without a second renewal", async () => {
  const h = setup("new");
  const f = jest.fn().mockResolvedValue(resp(401));
  await expect(apiFetch("me", {}, f)).rejects.toBeInstanceOf(SessionExpiredError);
  expect(h.renew).toHaveBeenCalledTimes(1);
  expect(h.onExpired).toHaveBeenCalled();
});

test("network failure is a NetworkError, not a sign-out", async () => {
  const h = setup("new");
  const f = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
  await expect(apiFetch("me", {}, f)).rejects.toBeInstanceOf(NetworkError);
  expect(h.onExpired).not.toHaveBeenCalled();
});
