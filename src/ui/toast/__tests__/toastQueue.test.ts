import { nextToast, TOAST_DURATION_MS } from "../toastQueue";

test("Q5: a new toast replaces the current one and lasts 5 s", () => {
  const a = nextToast(null, { message: "A" }, 1);
  const b = nextToast(a, { message: "B" }, 2);
  expect(b).toEqual({ message: "B", id: 2 });
  expect(TOAST_DURATION_MS).toBe(5000);
});
