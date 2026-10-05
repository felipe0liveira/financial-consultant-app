export const FULL_SWIPE_RATIO = 0.6;
/** True when a release past 60 % of the row width should execute the action (spec Q2). */
export function isFullSwipe(translationX: number, rowWidth: number): boolean {
  return rowWidth > 0 && Math.abs(translationX) >= rowWidth * FULL_SWIPE_RATIO;
}

export const PAY_LABELS = { pay: "Pagar", receive: "Receber", unpay: "Desfazer pagamento" } as const;
