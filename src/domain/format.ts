const brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0,
});

/** "R$ 1.234,56" — lists and cards. */
export const formatBRL = (reals: number): string => brl2.format(reals);
/** "R$ 1.235" — charts and the category legend. */
export const formatBRL0 = (reals: number): string => brl0.format(reals);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthDate = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
};

/** "Setembro de 2026". */
export function formatMonthLong(month: string): string {
  const d = monthDate(month);
  return `${capitalize(d.toLocaleDateString("pt-BR", { month: "long" }))} de ${d.getFullYear()}`;
}

/** "set." — chart labels. */
export function formatMonthShort(month: string): string {
  return monthDate(month).toLocaleDateString("pt-BR", { month: "short" });
}

/** "Domingo, 4 de outubro" — Painel header. */
export function formatHeaderDate(date: Date): string {
  const weekday = capitalize(date.toLocaleDateString("pt-BR", { weekday: "long" }));
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${weekday}, ${date.getDate()} de ${month}`;
}

/** Adds n months to a YYYY-MM key. */
export function addMonths(month: string, n: number): string {
  const d = monthDate(month);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "1,5%" — one decimal. */
export function formatPct(value: number): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
