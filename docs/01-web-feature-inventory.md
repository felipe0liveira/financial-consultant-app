# Web Feature Inventory (parity baseline)

> Source of truth: `financial-consultant-web` code as of 2026-10-04 (Next.js 16 App Router + Bun,
> PWA + BFF). This is the list of capabilities the iOS app must match. All user-facing copy is
> **pt-BR**; Portuguese strings below are quoted verbatim as UI copy.

**Scope rule for mobile:** the web landing page is **not** ported. On iOS, the **login screen is
the home screen** for signed-out users; signed-in users land on the Dashboard (Painel).

---

## 0. Feature matrix

| # | Area | Web route | iOS parity | Notes |
|---|---|---|---|---|
| F1 | Google sign-in / sign-out | `/api/auth/*` | **Required** | Login screen replaces the landing page |
| F2 | Dashboard (Painel) | `/` | **Required** | Current month only |
| F3 | Bills (Contas) — list, filters, search | `/bills` | **Required** | Core screen |
| F4 | Bill create / edit / pay / delete | Drawer forms | **Required** | Includes installments, recurring, edit scope |
| F5 | Select mode + quick sum + add to group | `/bills` | **Required** | |
| F6 | Groups (Grupos) | `/grupos` | **Required** | |
| F7 | Recurring rules (Recorrentes) | `/recurring` | **Required** | |
| F8 | Categories & budgets | `/categories` | **Required** | |
| F9 | Reports (Relatórios) | `/reports` | **Required** | Read-only |
| F10 | In-app notifications | bell | **Required** | |
| F11 | Push notifications (due bills) | Settings | **Required (APNs)** | Needs API work — Web Push only today |
| F12 | Settings: profile, appearance | `/settings` | **Required** | |
| F13 | Spreadsheet import (AI) | `/settings` | **Required** | `.xlsx`/`.csv` via document picker |
| F14 | Instant load from cache | global | **Required** | Persisted query cache |
| F15 | Update prompt | global | **Not needed** | App Store / TestFlight handles updates |
| F16 | Landing page | `/` signed out | **Excluded** | Login is home |
| F17 | Offline page | `/~offline` | **Adapted** | Native offline banner/state |

---

## 1. Navigation & shell

- Primary sections: **Painel**, **Contas** (badge = unpaid count), **Grupos**, **Recorrentes**,
  **Categorias**, **Relatórios**; account section: **Ajustes**.
- Global affordances: notifications bell with unread badge (capped "9+"); a coral **"Nova conta"**
  action (FAB on mobile web).
- Create/edit surfaces open as a bottom sheet on mobile (drag-to-dismiss past 120 px or
  > 600 px/s flick).
- UX rules to preserve: no dead taps (show progress on the tapped element), every destructive
  action asks for confirmation, forms end on an inline success screen with **Concluir**.

## 2. Authentication (F1)

- Google only, scopes `openid profile email`.
- Session lifetime 7 days, **no refresh** on web.
- Profile (name, email, avatar) comes from the Google ID token claims — **never** from the API.
  Avatar falls back to initials.
- Sign out: confirmation "Sair da conta?", then clear the local cache and the session.
- Cache owner guard: wipe persisted cache if `user_id` changes.

## 3. Dashboard — Painel (F2)

Always the current month.

- **Header:** "Olá, {first name}" + "{Weekday}, {d} de {month} · você tem N contas este mês".
- **KPI cards** (stagger in, count-up values, tap-to-flip):
  1. **Total do mês** (coral hero): total expenses, "N contas no total", decorative sparkline.
  2. **Pago** (mint): paid amount, "X de N contas" ⇄ "% do total do mês".
  3. **A pagar** (amber): unpaid amount, "R$ X em atraso" or "Em dia" ⇄ %.
  Paid/unpaid count expenses only.
- **"Gastos do mês" chart:** area chart of monthly expenses; range 3 / 6 / 9 months (default 3).
- **"Contas a pagar":** unpaid bills bucketed by status, "Ver detalhes ›" → Contas. Row tap →
  details sheet; ⋯ → row actions. Empty states for "no bills" and "all paid".
- **Desktop-only rail** (optional on iOS, could become sections): "Próximos vencimentos" (up to 4)
  and "Por categoria" donut (top 6).

## 4. Bills — Contas (F3, F4, F5)

### List
- **Month stepper** ("Setembro de 2026").
- **KPIs** derived client-side: **Vence hoje** (only when applicable), **A receber ⇄ Recebido**,
  **A pagar ⇄ Pago**, **Saldo livre ⇄ % da entrada** (green ≥ 0, red < 0). Flip cards open on
  the confirmed face when the pending side is 0.
- **Search** "Buscar contas…": debounce 300 ms, ≥ 2 chars, server-side
  (`GET /transactions/search?month&description`).
- **Filters sheet** "Filtros": *Agrupar por* (situação / categoria / grupo), *Situação* chips
  (Todas, Atrasadas, Vencem hoje, Esta semana, Próximas, Pagas, Previstas), *Categoria* chips;
  footer "Ver N contas" with live count + reset; active filters as removable chips.
- **Buckets:** by status (Atrasado → Vence hoje → Esta semana → Próximo → Confirmado →
  Previstas), by category (pt-BR alphabetical), or by group (a bill appears in every group it
  belongs to; ungrouped last, no heading).
- **Row:** category icon, description, Recorrente/Parcela hints, group chips (max 2, "+N"),
  status pill, amount (income green). Pagination "Carregar mais" (cursor).

### Derived bill status (client-side, no server field)
| Status | Rule | Pill |
|---|---|---|
| `paid` | `confirmed` | "Pago" / "Recebido" |
| `projected` | past due, unconfirmed, virtual (`transaction_id == null`) | "Prevista" |
| `overdue` | past due, unconfirmed, real row | "Atrasado" |
| `due-today` | due today | "Hoje" |
| `this-week` | 1–7 days | "Em N dias" |
| `upcoming` | > 7 days | "Em N dias" |

Skipped (tombstoned) rows are hidden.

### Row actions
- **Marcar como pago / recebido** (unpaid only; optimistic `PATCH /transactions {confirmed:true}`).
- **Ver detalhes** (sheet "Detalhes da conta": status sentence such as "Vence dom., 1 nov. · em 29 dias",
  tags, group chips removable, "Comentário", footer pay / Editar / Excluir).
- **Editar**, **Adicionar a um grupo** (enters select mode), **Converter em recorrente**
  (one-off only; optional "Repetir até" month), **Excluir**.
- **Delete confirmations:** one-off "Excluir conta?"; installment **"Excluir parcelamento?"**
  deletes the whole series (`DELETE /installments/{id}`); recurring occurrences become tombstones.

### Create — "Nova conta"
- **Categoria** from saved catalog + defaults, inline "+ nova categoria" (`POST /categories`),
  default "Contas".
- **Descrição** with the **installment shortcut**: trailing `N/M` (e.g. "Passagens aéreas 3/5")
  becomes an installment purchase (text stripped, recurring disabled, hint shown), created with
  `installment_backfill_paid: true`.
- **Tipo** Saída / Entrada (default Saída). **Valor** with bank-style currency mask (digits fill
  from the right, "R$ 0,00", empty ≠ zero, integer cents internally).
- **Data** (default 1st of viewed month, dd/MM/yyyy).
- **"Repetir todo mês"**; if start is in the past, **"Já venho pagando desde então"** backfills paid.
- Validation copy, success titles "Conta criada!" / "Entrada criada!" / "Parcelamento criado!".

### Edit — "Editar conta"
- Categoria, Descrição, Tipo, Valor, Dia do mês (1–31), "Pago/Recebido" switch (only when
  already confirmed — the only way to un-pay).
- **Recurring scope "Aplicar a":** Somente esta / Esta e as futuras / Esta e as anteriores / Todas.
- Installments: direction/category changes apply to the whole series.
- Call order: `PATCH /transactions` first, then `PATCH /series` (when scope ≠ "only this").

### Select mode + quick sum
- "Selecionar" toggles checkbox rows; floating bar shows the **signed net total** (+green / −red,
  U+2212) and "N selecionada(s)".
- "Adicionar ao grupo…" → pick existing or inline "Novo grupo…" (name + colour); one
  `POST /groups/{id}/members` per bill.

### Errors to map (pt-BR)
- 401 → "Sua sessão expirou. Entre novamente para continuar."
- 409 ambiguous → "Há mais de uma conta parecida…"
- 404 → "Não encontrei essa conta…"
- 409 duplicate → "Já existe uma conta igual neste mês…"

## 5. Groups — Grupos (F6)
- List: colour dot, name, "N contas", chevron; "Novo grupo".
- Detail: summary card (Editar / Excluir), month stepper, **"Marcar grupo como confirmado esse mês"**
  switch (`POST /groups/{id}/settle`), read-only bill rows.
- Form: Nome + Cor (tokens `moradia | contas | lazer | transporte | coral`).
- Delete: "Excluir grupo?" — bills are kept.

## 6. Recurring — Recorrentes (F7)
- Active rules (sorted category → description): "category · todo dia D · desde mmm/AAAA", note,
  amount. Collapsible "Desativadas (N)".
- Actions: **Editar**; **Converter em lançamento** (month stepper → `POST /transactions/confirm`);
  **Desativar** (soft delete); **Excluir** (hard delete, all occurrences).
- Form: Categoria, Descrição, Valor, Dia do mês, Início, Fim (optional). Expense-only today.

## 7. Categories & budgets — Categorias (F8)
- Month stepper. Budget rows: "R$ gasto de R$ limite" (projected spend), remaining/over badge,
  progress bar (< 80 % mint, ≥ 80 % amber, > 100 % red), edit.
- "Sem orçamento": categories with spend but no limit → **Definir**.
- Budget form (add / edit / **Remover orçamento**); Add category form.

## 8. Reports — Relatórios (F9, read-only)
1. **Fechamento do mês:** health score 0–100 (Saudável ≥ 70, Atenção ≥ 40, Crítico), stat tiles,
   daily-spend trend, "Maiores gastos" bars.
2. **Ano:** own year stepper, income/expense tiles, grouped monthly bars (future faded), top 6 categories.
3. **Previsão do próximo mês:** estimated income/expense/balance, "Lançamentos previstos" list.
4. **Parcelas:** total remaining, per-purchase progress "c/t".
5. **Metas:** per-goal progress and pace badge (view only).

## 9. Notifications (F10, F11)
- Bell dropdown: "Notificações", "N nova(s)", "Marcar todas como lidas"; items with unread dot,
  title, 2-line body, relative time ("agora", "há N min"…). Tap → mark read + navigate
  (`data.href` or Contas). Polled every 120 s.
- Push: due-bill reminders (D-1, D0, D+1) produced by the API's daily job. Web uses VAPID;
  **iOS requires APNs** (new API work).

## 10. Settings — Ajustes (F12, F13)
- **Perfil:** avatar, name, email, **Sair**.
- **Aparência:** Claro / Escuro / Sistema (default Sistema).
- **Notificações:** enable switch with state-specific hints.
- **Importar contas do mês:** reference month + `.xlsx`/`.csv` (≤ 5 MB) → "Analisar planilha"
  ("A IA está lendo sua planilha…") → review screen "Revisar importação" with editable cards
  (description, category, day, amount, direction, installment c/t, paid, recurring) →
  **Confirmar (N)** → "Importação concluída!".

## 11. Data layer behaviour (F14)
- Stale time 30 s, cache retained 24 h, refetch on foreground.
- Persisted cache → instant render on launch, background refresh with a subtle "Atualizando dados…".
- Optimistic mutations: pay, create, update, delete bill; add/remove category; set budget;
  recurring update/deactivate/delete; mark notifications read.
- Offline **writes are not supported** (read-only from cache when offline).

## 12. Formatting
- Currency `pt-BR` BRL; 2 decimals in lists, 0 decimals in charts/reports.
- Months "Setembro de 2026" / "set." / "jul/2026"; dates "seg., 8 jul", "dd/MM/yyyy".
- Month keys `YYYY-MM` from **local** time; due-bill logic uses America/Sao_Paulo.

---

## 13. Known gaps on the web (do **not** block iOS parity)

These exist in the API but not in the web UI. iOS v1 matches the **web**, not the API; each
can be added to both clients later.

- Reconciliation (`/reconcile`, `/checkpoints`) — advertised on the landing page, no UI.
- Goals create/edit (`POST /goals`) — view-only on web.
- Daily insights (`/insights/daily`) — not exposed.
- Delete category — route exists, no UI.
- Edit transaction `comment` and recurring `note` — display-only.
- Income-type recurring rules from the Recorrentes form.
- Finished installments list.
- Inconsistency: Edit bill / Recurring forms use a hardcoded 8-category list instead of the
  saved catalog. **iOS should use the saved catalog everywhere.**

## 14. Doc drift found while mapping

- Web `CLAUDE.md` says the Cloud Run ID-token gate is pending — it is implemented (`lib/api.ts`).
- Web `CLAUDE.md` references `.sdd/specs/dashboard-mockup.html` — the file does not exist.
- API `CLAUDE.md` still describes households and `web_<sub>` ids — both were removed; ids are opaque.
