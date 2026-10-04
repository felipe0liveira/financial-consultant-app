/**
 * Money helpers for form input.
 *
 * Form state holds INTEGER CENTS, so it is valid by construction: there is no
 * intermediate string to parse and no NaN to guard against. Reais appear only at
 * the API boundary, where centsToReals rebuilds the float the -api expects.
 *
 * These functions are pure and know nothing about inputs or React.
 */

/** Largest value the mask accepts: 12 digits, i.e. R$ 9.999.999.999,99. */
export const MAX_MONEY_DIGITS = 12;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Reads arbitrary typed or pasted text as cents, keeping only its digits.
 *
 * Returns null when there is no digit at all, or when every digit present is
 * a leading zero — both collapse to the empty state, which is deliberately
 * distinct from zero (see the spec). This is what lets backspacing away the
 * last digit actually reach empty: "R$ 0,01" backspaced becomes digits "00",
 * which must clear the field instead of re-rendering as "R$ 0,00" forever.
 *
 *   "15000"    -> 15000
 *   "1.234,56" -> 123456
 *   "007"      -> 7
 *   ""         -> null
 *   "0"        -> null
 *   "00"       -> null
 *
 * Digits past MAX_MONEY_DIGITS are dropped from the right (applied before
 * leading zeros are stripped, so the 12-digit ceiling itself is unaffected),
 * so a 13th keystroke is ignored rather than silently shifting the value.
 */
export function digitsToCents(raw: string): number | null {
  const capped = raw.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
  const digits = capped.replace(/^0+/, "");
  if (digits === "") return null;
  return Number(digits);
}

/** Reais -> the pt-BR display string. 150.5 -> "R$ 150,50" */
export function formatBRL(reals: number): string {
  return brl.format(reals);
}

/** Integer cents -> the pt-BR display string. 15000 -> "R$ 150,00" */
export function formatCents(cents: number): string {
  return formatBRL(centsToReals(cents));
}

/** Reais as stored by the API -> integer cents. 150.5 -> 15050 */
export function realsToCents(reals: number): number {
  return Math.round(reals * 100);
}

/** Integer cents -> reais for the API payload. 15050 -> 150.5 */
export function centsToReals(cents: number): number {
  return cents / 100;
}
