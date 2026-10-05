import { isFullSwipe, PAY_LABELS } from "../swipe";

test("Q2: full swipe threshold at 60 % of the width", () => {
  expect(isFullSwipe(240, 400)).toBe(true);
  expect(isFullSwipe(-240, 400)).toBe(true);
  expect(isFullSwipe(239, 400)).toBe(false);
  expect(isFullSwipe(500, 0)).toBe(false);
});

test("Q1/Q6: labels", () => {
  expect(PAY_LABELS).toEqual({ pay: "Pagar", receive: "Receber", unpay: "Desfazer pagamento" });
});
