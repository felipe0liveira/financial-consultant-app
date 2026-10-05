# Nova Conta — Create Bills (Phase 3b)

## Goal & context

Phases 2 and 3a let people see their bills and act on existing ones (pay, undo, delete). Phase 3b
adds the missing write path: **creating** a bill — a one-off expense, an income, a recurring
monthly bill, or an installment purchase — from the iOS app, with the same capabilities and copy
as the web's "Nova conta" form.

Parity reference: `docs/01-web-feature-inventory.md` §4 "Create — Nova conta";
`financial-consultant-web/components/dashboard/add-bill-form.tsx`, `hooks/use-create-bill.ts`,
`lib/money.ts` (currency mask). The app reuses the groundwork from Phase 3a: the footer toast,
the offline guard and the error-message style.

All user-facing copy is **pt-BR**; Portuguese strings below are UI copy.

## Scope

### In scope

- A **"+" entry point** on Contas and on Painel.
- A **"Nova conta" form** in a tall native sheet: Categoria, Descrição, Tipo, Valor, Data,
  "Repetir todo mês", and "Já venho pagando desde então".
- **Installment detection** from a trailing `N/M` in the description.
- **Inline category creation** ("Nova categoria…").
- Validation, server errors (including duplicates), offline blocking, and a discard
  confirmation.
- A success toast, and refreshing every screen that shows the affected month.

### Out of scope

- Editing a bill, converting it to recurring, select mode, quick sum, and groups (Phase 3c).
- A "Criar mesmo assim" override for duplicates. The web has none, and the BFF does not forward it.
- Optimistic insertion of the new bill (by decision, the app waits for the server).
- An "Desfazer" option on create.
- Offline queueing.
- Changes to `financial-consultant-web` or `financial-consultant-api`.

## Requirements

### Entry point

1. **Contas:** a round "+" button in the accent (coral) colour sits to the right of the screen
   title. Tapping it opens the Nova conta form, with the date defaulting to the **1st of the month
   currently open** in Contas.
2. **Painel:** the same "+" button sits to the right of the title. The date defaults to the
   **1st of the current month**.
3. The form opens in a **tall native sheet** (nearly full screen) with **"Cancelar"** and
   **"Salvar"** at the top. Its content scrolls, and when the keyboard is up, the focused field
   always stays visible.

### Fields and defaults

4. **Categoria:**
   - The field shows the selected category, which defaults to **"Contas"**.
   - Tapping it opens a **native iOS menu**. The menu lists the user's saved categories merged
     with the defaults (Moradia, Contas, Alimentação, Transporte, Saúde, Lazer, Educação,
     Outros), with no duplicates.
   - The last entry is **"Nova categoria…"** (requirement 13).
5. **Descrição:** free text.
6. **Tipo:** **Saída** or **Entrada**, with Saída as the default.
7. **Valor (R$):**
   - The field uses the same currency mask as the web: typed digits fill from the cents, are
     shown as BRL, and are limited to 12 digits.
   - The value is always typed as a positive magnitude. Tipo decides the sign.
8. **Data:**
   - The date is shown as **dd/MM/aaaa** and opens the **native iOS calendar**.
   - The user may pick any date, including one in another month. The bill is created in the
     month of the chosen date.
9. **"Repetir todo mês":** a switch that is off by default. When it is on, the hint
   **"Repete todo dia D, a partir de {mês de aaaa}."** appears below it, and it follows the
   chosen date live.
10. **"Já venho pagando desde então":**
    - The switch appears only when "Repetir todo mês" is on, the description has no installment
      marker, and the chosen date's month is **before the current month**.
    - It carries the subtitle **"Marca os meses anteriores como pagos"** and is off by default.
    - Turning "Repetir todo mês" off also turns it off.
    - When it is on, the months from the start up to before the current month are recorded as
      paid.

### Installment detection

11. **Given** a description that ends in whitespace followed by `N/M`, where 1 ≤ N ≤ M, M ≥ 2 and
    the remaining title is not empty (for example "Passagens aéreas 3/5"), **then** the form
    treats the bill as an installment purchase:
    - The hint **"Detectamos M parcelas em "{título}" — vamos cadastrar da 1 à M (a Nª é a
      atual). O valor é por parcela."** appears below the description.
    - "Repetir todo mês" is shown off and disabled, and "Já venho pagando desde então" is hidden.
    - On save, the title is stored without the `N/M` marker. All M installments are created, and
      the ones before N are recorded as paid.
12. A slash that is not a valid trailing marker does not trigger detection. Examples: "1/2 kg de
    arroz", a bare "3/5", "Compra 6/5" and "Compra 1/1". In these cases the description is kept
    verbatim.

### Inline category creation

13. **When** the user picks "Nova categoria…", **then**:
    - A native dialog asks for the name, with "Cancelar" and "Criar".
    - On "Criar", the category is created on the server and becomes the selected one. The
      category list everywhere includes it from then on.
    - An empty or blank name does nothing.
    - A name that already exists (ignoring case) just selects the existing category.

### Saving

14. **Validation runs on "Salvar"** with the web's messages, shown inline in the form:
    - empty or blank description → **"Informe uma descrição para a conta."**
    - value of zero → **"Informe um valor válido maior que zero."**
15. **Not optimistic.** While saving, the "Salvar" control shows **"Salvando…"** and the form
    cannot be edited or saved twice.
16. **On success:**
    - The sheet closes and the footer toast shows **"Conta criada"**, **"Entrada criada"** or
      **"Parcelamento criado"**. Installment takes precedence, then Entrada; otherwise it is
      Conta.
    - Painel, Contas and any other screen showing the affected month reload, so the new bill
      appears.
17. **On failure,** the form stays open with every field intact and a pt-BR error message shown
    in the form.

### Leaving the form

18. **Given** the form has changes from its initial state, **when** the user taps "Cancelar" or
    drags the sheet down, **then** a native confirmation asks **"Descartar esta conta?"** with
    **"Descartar"** (destructive) and **"Continuar editando"**. With no changes, the form closes
    immediately.

## Edge cases & error handling

- **Duplicate (the server reports an identical bill already exists this month):** the form shows
  **"Já existe uma conta igual neste mês. Ajuste os dados ou tente novamente."** and stays open.
- **Offline:**
  - "Salvar" and "Criar" (new category) do not reach the server. They show the same "Sem
    conexão…" message as Phase 3a.
  - The form stays open and unchanged.
- **Category creation fails** (server error): the dialog closes, the previously selected
  category is kept, and a pt-BR error message is shown.
- **Session expired:** behaves like every other authenticated call in the app (back to sign-in).
- **Installment marker added after the switches were turned on:** this matches the web.
  - "Já venho pagando desde então" is turned off.
  - "Repetir todo mês" is shown off and disabled while the marker is present.
  - Removing the marker brings "Repetir todo mês" back to its earlier value. The backfill stays
    off.
- **The chosen date moves to the current or a future month:** "Já venho pagando desde então"
  disappears and is not sent.
- **Day beyond a month's length** in later months of a recurring bill: the server applies its
  usual rule. The app does not adjust it.

## Success criteria

- From both Contas and Painel, a user can create each kind of bill and see it appear in the list
  of its month after the sheet closes, with the matching toast:
  - a one-off expense
  - an income
  - a recurring bill (with and without "Já venho pagando desde então")
  - an installment purchase
- "Passagens aéreas 3/5" creates five installments titled "Passagens aéreas", with the first
  two recorded as paid.
- A category created through "Nova categoria…" is selected immediately and is offered the next
  time the form opens.
- Validation, duplicate, offline and server-error cases show the copy above, and nothing typed
  is lost.
- Dismissing a form with changes always asks first; dismissing an untouched form never does.
- Automated tests cover installment detection, validation, the success-title choice, the
  backfill switch visibility rule, and the request sent for each kind of bill.
- Any bills or categories created while manually testing against the production account are
  deleted afterwards. Bills and installment series are removed with the app's own delete action;
  recurring rules and categories are removed through the web.

## Open questions

None. (Test clean-up note: the app cannot delete a category or a recurring rule, but the web and
its BFF can — a category or recurring rule created while manually testing is removed through the
web afterwards.)
