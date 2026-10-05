# Quick Bill Actions — Pay, Undo, Delete (Phase 3a)

## Goal & context

Phase 2 made Painel and Contas read-only views of real data. Phase 3a adds the **actions people
use every day** on a bill: mark it as paid or received, undo that, and delete it — reachable both
by **swiping a row** (the iOS Mail pattern) and from the **details sheet**.

It also lays the groundwork the next phases reuse: changes appear immediately (optimistic), every
screen showing the bill stays consistent, and failures roll back with a pt-BR message.

Parity reference: the web's row actions and copy (`docs/01-web-feature-inventory.md` §4,
`financial-consultant-web/components/bills/use-bill-actions.tsx`, `hooks/use-pay-bill.ts`,
`hooks/use-delete-bill.ts`). The app goes **beyond** the web in two places, by decision: undoing a
payment is a first-class action (on the web it is only possible through the edit form), and a
paid/received confirmation offers **Desfazer** for a few seconds.

All user-facing copy is **pt-BR**; Portuguese strings below are UI copy.

## Scope

### In scope

- **Swipe actions** on bill rows in Contas and in Painel's "Contas a pagar":
  - swipe right → **Pagar** (expense) / **Receber** (income); on a paid bill → **Desfazer
    pagamento**;
  - swipe left → **Excluir**;
  - a full swipe executes the action (delete still asks for confirmation).
- **Actions footer** in the bill details sheet with the same actions.
- **Undo toast** after paying/receiving.
- **Delete confirmation**, including deleting a whole installment series.
- Optimistic updates with rollback, haptic feedback, error messages, offline blocking.

### Out of scope

- Creating bills ("Nova conta") — Phase 3b.
- Editing a bill, convert to recurring, select mode / quick sum / groups — Phase 3c.
- Offline queueing of actions.
- A picker to resolve ambiguous matches (the API cannot distinguish identical rows anyway).
- Changes to `financial-consultant-web` or `financial-consultant-api`.

## Requirements

### Pay / receive

- **Q1 — Swipe to pay.** Given an unpaid bill row, when the person swipes it to the right, then a
  green **"Pagar"** action (or **"Receber"** for income) is revealed; tapping it marks the bill
  as confirmed.
- **Q2 — Full swipe pays immediately.** Given an unpaid bill row, when the person swipes it fully
  to the right, then the bill is marked as confirmed without a further tap.
- **Q3 — Immediate feedback.** When a bill is marked as confirmed, then everywhere it appears —
  the row's status pill, Contas buckets and KPIs, Painel KPIs, "Contas a pagar", "Próximos
  vencimentos" and the Contas tab badge — reflect the change immediately, before the server
  answers, and a success haptic plays.
- **Q4 — Painel list.** Given Painel's "Contas a pagar" (unpaid bills only), when a bill there is
  paid, then it leaves that list with an animation (the web's to-do behaviour).
- **Q5 — Undo toast.** After a bill is paid or received (from a swipe or the sheet), a toast
  "Conta paga" / "Conta recebida" with **Desfazer** shows for **5 seconds**. Tapping Desfazer
  returns the bill to pending (same feedback rules as Q3). The toast disappears after 5 seconds
  or when another toast replaces it.

### Undo payment

- **Q6 — Swipe to undo.** Given a paid/received bill row, when the person swipes it to the right,
  then a **"Desfazer pagamento"** action is revealed; tapping it (or a full swipe) returns the bill
  to pending, with the same immediate feedback as Q3. No undo toast is shown for this action.

### Delete

- **Q7 — Swipe to delete.** Given any bill row, when the person swipes it to the left, then a red
  **"Excluir"** action is revealed; tapping it or swiping fully opens the delete confirmation.
- **Q8 — Single bill confirmation.** For a bill that is not part of an installment series, the
  confirmation reads **"Excluir conta?"** — "A conta “{descrição}” será removida deste mês. Não dá
  para desfazer." with **Cancelar** / **Excluir**.
- **Q9 — Installment series confirmation.** For an installment bill that belongs to a series, the
  confirmation reads **"Excluir parcelamento?"** — "As {N} parcelas de “{descrição}”, de {mês/ano}
  a {mês/ano}, serão apagadas[ — incluindo parcelas já pagas]. Não dá para desfazer." Confirming
  deletes the whole series (same rule and wording as the web).
- **Q10 — Recurring occurrences.** Deleting an occurrence of a recurring bill removes only that
  month's occurrence (the server records it as skipped); the rule and other months stay.
- **Q11 — After delete.** The bill disappears from every list and totals update immediately; a
  warning haptic plays on confirmation. Cancelling leaves everything untouched and closes the
  swipe.

### Details sheet

- **Q12 — Footer.** The bill details sheet gains a footer with **Pagar/Receber** (unpaid) or
  **Desfazer pagamento** (paid), and **Excluir**. Pay/receive keeps the sheet open showing the
  new status; delete closes the sheet after confirmation.

### Errors and connectivity

- **Q13 — Failure rolls back.** When the server rejects an action, every optimistic change is
  reverted and a message is shown:
  - ambiguous match (409): "Há mais de uma conta parecida. Ajuste os dados e tente de novo."
  - not found (404): "Não encontrei essa conta. Ela pode já ter sido removida."
  - expired session: "Sua sessão expirou. Entre novamente para continuar." (Phase 1 rules apply)
  - anything else: a generic pt-BR failure message naming the action.
- **Q14 — Offline.** When the device is offline, swipe actions and footer buttons stay visible,
  but executing one shows "Sem conexão. Tente de novo quando estiver online." and changes nothing.
- **Q15 — Precise targeting.** Every action identifies the bill by month, description, day and
  amount (as the web does), so two bills with the same description in a month are not confused.

### Accessibility

- **Q16 — Non-gesture access.** Every swipe action is also available without gestures: via the
  details sheet footer, and as accessibility actions on the row for VoiceOver users.

## Constraints

- Uses the BFF's existing routes: update a transaction (confirm/unconfirm), delete a transaction,
  delete an installment series. No new routes.
- The API matches rows by description substring plus optional day and amount; it returns 409 when
  that still matches more than one row.

## Edge cases & error handling

- **Projected (virtual) occurrences** of recurring rules or installment series can be paid,
  unpaid and deleted like real rows; the server materializes them when touched.
- **Legacy installment rows without a series id** delete only that month's row with the
  single-bill confirmation (web behaviour).
- **Rapid repeat actions** on the same bill (pay then undo quickly, or double full-swipe) must
  end in the state of the last action, with no duplicate requests left in flight changing it back.
- **Undo after leaving the screen:** the toast is global; tapping Desfazer still works if the
  person switched tabs within the 5 seconds.
- **Bill filtered out by the current filter after paying** (e.g. filter "Atrasadas"): it leaves
  the filtered list immediately; undo brings it back.
- **Search results:** actions work on rows shown from a search, and the search results refresh.

## Success criteria

- On the Simulator, with the account's real data, a bill can be paid by tap and by full swipe,
  undone from the toast within 5 seconds and from a swipe later, and deleted with the right
  confirmation — and the web shows the same resulting state for that bill.
- Deleting an installment bill deletes its whole series with the web's wording.
- With the BFF stopped, actions show the offline message and nothing changes.
- A forced server error rolls back the UI and shows the pt-BR message.
- Every requirement is covered by an automated test (state transitions, copy, error mapping,
  rollback) or a documented manual check.

## Open questions

- **Generic failure copy (Q13, "anything else"):** assume "Não foi possível pagar a conta. Tente
  de novo." / "Não foi possível excluir a conta. Tente de novo." unless the web's hooks use
  different wording (the plan will copy the web's exact strings if they exist).
