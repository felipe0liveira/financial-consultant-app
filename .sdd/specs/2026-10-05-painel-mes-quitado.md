# Painel — "Mês quitado" Card

## Goal & context

Painel opens with three KPI cards: **Total do mês**, **Pago** and **A pagar**. Once every expense of
the month is paid, the three cards repeat the same information: Total equals Pago, and A pagar
shows "R$ 0,00 · Em dia". The good state looks like an empty card.

This change replaces the three cards with a single **"mês quitado"** card while the month is
settled. The card celebrates the state, shows what was left over, and looks ahead to the next
month.

**App-only, by decision.** The web keeps its three cards; parity can be revisited later.

All user-facing copy is **pt-BR**; Portuguese strings below are UI copy.

## Scope

### In scope

- Detecting when the current month is settled.
- The "mês quitado" card shown in place of the three KPI cards, with:
  - a headline;
  - what was paid;
  - the month's result ("Sobrou" / "Faltou");
  - pending income, when there is any;
  - a preview of the next month.
- Switching between the card and the three KPI cards as bills change.
- Opening Contas on the next month from the preview.

### Out of scope

- Any change to `financial-consultant-web` or `financial-consultant-api`.
- Any change to the rest of Painel (chart, Contas a pagar, Próximos vencimentos, Por categoria).
- Celebration effects (confetti, sounds) beyond what the card itself shows.
- The opening balance ("saldo real").

## Requirements

### When the month is settled

1. **Given** the current month has at least one expense and **every expense is paid**, **then**
   Painel shows the "mês quitado" card instead of the three KPI cards.
   - Pending **income** does not prevent the settled state.
2. **Given** the current month has **no expenses at all**, **then** it is not settled and the three
   KPI cards are shown as today.
3. **Given** any expense of the current month is not paid, **then** the three KPI cards are shown
   as today.
   - This also applies when an expense becomes unpaid or a new unpaid expense appears while
     Painel is open. Examples: "Desfazer pagamento", or a bill created through Nova conta.
   - The switch happens as soon as Painel's data reflects the change, with no manual refresh.

### Card content

4. **Headline:** **"{Mês} quitado"**, for example "Outubro quitado", with a check mark.
5. **Paid line:** the total paid in expenses and the number of paid expenses. Example:
   "R$ 18.369,72 pagos · 24 contas", with "conta" in the singular when there is one.
6. **Month result:** received minus paid in the current month, counting confirmed income and paid
   expenses only.
   - Zero or positive: **"Sobrou no mês: R$ X"**.
   - Negative: **"Faltou no mês: R$ X"**, with X shown as a positive amount in the alert colour.
     A minus sign never appears next to "Sobrou".
7. **Pending income:** when the current month has income not yet received, the card shows
   **"Ainda falta receber R$ X"**, where X is the total of that pending income. With no pending
   income, this line is not shown.
8. **Next-month preview:**
   - The line reads **"{Próximo mês}: R$ X a pagar · próxima: {conta}, {quando}"**. X is the
     total of the next month's unpaid expenses. {conta} is the next month's earliest-due unpaid
     expense, and {quando} uses the same relative wording the app already shows for due dates.
     Example: "Novembro: R$ 17.755,89 a pagar · próxima: Cartão Santander, em 27 dias".
   - When the next month has no unpaid expense, the line reads **"{Próximo mês}: nada a pagar por
     enquanto"**.
9. **Tapping the preview** opens Contas showing the next month.

## Edge cases & error handling

- **Next-month data loading or failed:** the preview line is hidden and the rest of the card shows
  normally. The line appears once the data arrives.
- **Current-month data loading, failed or offline:** Painel behaves exactly as today. The card is
  only decided once the current month's data is available, so it never flashes before the data
  is known.
- **December:** the next month is January of the following year.
- **Month result exactly zero:** shown as "Sobrou no mês: R$ 0,00".

## Success criteria

- With every expense of the month paid, Painel shows a single card with the headline, paid line,
  month result and next-month preview, in place of the three KPI cards.
- With any expense unpaid, or none at all, Painel shows the three KPI cards exactly as before.
- Undoing a payment, or paying the last pending expense, switches between the two states
  without a manual refresh.
- "Faltou no mês" appears in the alert colour when paid exceeds received.
  "Ainda falta receber" appears only when income is pending.
- Tapping the preview opens Contas on the next month.
- Automated tests cover:
  - the settled rule (all paid, some unpaid, no expenses, pending income only);
  - the Sobrou/Faltou result;
  - the pending-income line;
  - the next-month preview (with bills, with none, and December → January).
