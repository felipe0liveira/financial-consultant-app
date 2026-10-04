# Painel & Contas — Read Core (Phase 2)

## Goal & context

Phase 1 delivered the app shell: Google sign-in, session, tab bar, and placeholder screens. Phase 2
makes the app **useful for reading**: a signed-in person sees their real bills on **Painel** and
**Contas**, with the same numbers they see on the web for the same account and month.

This phase is **read-only**. Every bill action (pay, create, edit, delete, convert, groups) is
Phase 3. Parity reference: `docs/01-web-feature-inventory.md` §3 (Painel), §4 (Contas — list,
status, details; not the write flows), §11 (data behaviour) and §12 (formatting). All data comes
from the BFF's existing `/api/v1/*` routes through the Phase 1 authenticated client; no change to
`financial-consultant-web` or `financial-consultant-api` is expected.

All user-facing copy is **pt-BR**; Portuguese strings below are UI copy, quoted verbatim from the
web where the web has them.

## Scope

### In scope

- **Painel** with real data for the current month, including the two blocks the web shows only on
  desktop ("Próximos vencimentos", "Por categoria"), placed at the end of the screen.
- **Contas**: month navigation, KPIs, search, filters, grouping, bucketed list, pagination.
- **Bill details sheet** (read-only).
- Client-side **bill status derivation** identical to the web.
- **Instant load** from a cache kept on the device, background refresh, pull-to-refresh.
- **Offline** behaviour with cached data and a discreet notice.
- **Unpaid-count badge** on the Contas tab.
- Remembering the chosen **"Agrupar por"** across launches.
- Motion parity (staggered KPIs, count-up values, flip cards, chart draw-in), respecting Reduce
  Motion.

### Out of scope

- Any write action and its UI: pay/receive, create ("Nova conta" / FAB), edit, delete, convert to
  recurring, add/remove from groups, select mode and quick sum, row ⋯ menus, the details sheet's
  action footer — **Phase 3**.
- Grupos, Recorrentes, Categorias, Relatórios screens — **Phase 4**.
- Notifications bell and push — **Phase 5**.
- Persisting the status/category filters (only "Agrupar por" persists).
- Offline writes; month navigation on Painel (it is always the current month, as on the web).

## Requirements

### Painel

- **P1 — Header.** Shows "Olá, {first name}" and "{Weekday}, {d} de {month} · você tem N contas
  este mês" for the current month.
- **P2 — KPI cards.** Three cards, matching the web:
  1. **Total do mês** — total expenses and "N contas no total".
  2. **Pago** — amount paid and "X de N contas"; tapping flips to "% do total do mês".
  3. **A pagar** — amount unpaid, then "R$ X em atraso" or "Em dia"; tapping flips to a %.
  Paid and unpaid figures count **expenses only**. Values count up on first display; cards enter
  staggered.
- **P3 — "Gastos do mês" chart.** Area chart of total expenses per month, with a 3 / 6 / 9 month
  selector (default **3**) and short pt-BR month labels. Empty: "Nenhum dado disponível para este
  período."
- **P4 — "Contas a pagar".** Unpaid bills of the current month, bucketed by status (bucket heading
  with label and count). "Ver detalhes ›" opens Contas on the current month. Tapping a row opens
  the details sheet. Empty states: "Nenhuma conta cadastrada para este mês." and, when everything
  is paid, "Tudo pago por aqui. Nenhuma conta pendente neste mês."
- **P5 — "Próximos vencimentos".** Up to **4** unpaid bills, soonest first, each with a date badge
  (day + short month), description and amount. Empty: "Nenhuma conta pendente."
- **P6 — "Por categoria".** Donut of the top **6** categories by absolute amount, with a legend.
  Empty: "Nenhum dado disponível."
- **P7 — Order.** Header → KPIs → "Gastos do mês" → "Contas a pagar" → "Próximos vencimentos" →
  "Por categoria".

### Contas

- **C1 — Month navigation.** Previous/next stepper labelled like "Setembro de 2026". Opening Contas
  from Painel lands on the current month.
- **C2 — KPIs.** **Vence hoje** (only when something is due today, subtitle "Não deixe vencer"),
  **A receber ⇄ Recebido**, **A pagar ⇄ Pago**, **Saldo livre ⇄ % da entrada** (green when ≥ 0,
  red when negative; "—" when there is no income). The receivable/payable cards open on their
  confirmed face when the pending side is 0 and the confirmed side is not.
- **C3 — Search.** Field "Buscar contas…". Searches on the server, scoped to the month being viewed,
  once the text has at least **2** characters, **300 ms** after the last keystroke.
- **C4 — Filters.** A "Filtros" sheet with: **Agrupar por** (situação / categoria / grupo; "grupo"
  disabled when the person has no groups), **Situação** (Todas, Atrasadas, Vencem hoje, Esta
  semana, Próximas, Pagas, Previstas), **Categoria** (Todas + each category in the month). The
  sheet footer shows "Ver N contas" with a live count and a reset action. Active filters appear as
  removable chips.
- **C5 — Grouping.** By status in the order Atrasado → Vence hoje → Esta semana → Próximo →
  Confirmado → Previstas; by category alphabetically (pt-BR); by group alphabetically, a bill
  appearing under every group it belongs to and ungrouped bills last with no heading.
- **C6 — Grouping persists.** The chosen "Agrupar por" is remembered across app launches; the
  status and category filters reset to "Todas" on each launch.
- **C7 — Rows.** Category icon and colour, description, "Recorrente"/"Parcela" hints, group chips
  (at most 2, then "+N"), status pill, amount (income in green). Overdue/due-today pills are shown
  even when not grouping by status.
- **C8 — Pagination.** "Carregar mais" loads the next page; "Carregando…" while loading.
- **C9 — Empty and error states.** "Nenhuma conta encontrada para essa busca." / "Nenhuma conta
  com esses filtros." / "Nenhuma conta cadastrada para este mês." / "Não foi possível carregar as
  contas: …".

### Bill status (shared by Painel and Contas)

- **S1 — Derivation.** Status is derived on the device, exactly as on the web:

  | Status | Rule | Pill |
  |---|---|---|
  | paid | confirmed | "Pago" / "Recebido" |
  | projected | past due, unconfirmed, virtual (no transaction id) | "Prevista" |
  | overdue | past due, unconfirmed, real row | "Atrasado" |
  | due-today | due today | "Hoje" |
  | this-week | due in 1–7 days | "Em N dias" |
  | upcoming | due in more than 7 days | "Em N dias" |

- **S2 — Skipped rows** (tombstoned occurrences) are never shown or counted.
- **S3 — Dates** are evaluated in the device's local time zone.

### Details sheet

- **D1 — Content.** Title "Detalhes da conta"; description and amount; a status sentence such as
  "Vence dom., 1 nov. · em 29 dias", "Venceu … · atrasado há N dias", "Vence hoje, …",
  "Prevista para …", "Pago · vencimento …"; tags for category, "Recorrente", "Parcela c/t" and
  group chips; a "Comentário" block when present.
- **D2 — Read-only.** No action footer, no ⋯ menu. The sheet can be dismissed by dragging down.

### Data freshness, cache and offline

- **F1 — Instant load.** On launch, Painel and Contas render immediately from data saved on the
  device, then refresh in the background.
- **F2 — Freshness.** Data is considered fresh for **30 seconds**; after that it is refetched when
  the screen is shown again or the app returns to the foreground.
- **F3 — Retention.** Saved data is kept for **24 hours**; older data is discarded.
- **F4 — Refresh notice.** "Atualizando dados…" appears only when a background refresh of data
  already on screen takes longer than **400 ms**.
- **F5 — Pull-to-refresh** on Painel and Contas.
- **F6 — Offline with data.** When there is no connection, cached screens stay visible with a
  discreet notice "Sem conexão · mostrando os últimos dados salvos".
- **F7 — Offline without data.** A screen with nothing cached (e.g. a month never opened) shows
  "Sem conexão" and a **Tentar novamente** button.
- **F8 — Offline search.** Searching while offline shows that search needs a connection instead of
  results.
- **F9 — Loading.** First load with no cache shows skeleton placeholders, never a blank screen.

### Account boundaries

- **A1 — Owner guard.** Saved data belongs to the signed-in user: it is cleared on sign-out, and a
  different user signing in never sees a previous user's data, even briefly.

### Contas badge

- **B1 — Badge.** The Contas tab shows the number of **unpaid bills of the current month**; no
  badge when that number is 0.

### Formatting & motion

- **M1 — Money and dates.** BRL in pt-BR: 2 decimals in lists and cards, 0 decimals in charts and
  the "Por categoria" legend. Months "Setembro de 2026" / "set."; dates "seg., 8 jul".
- **M2 — Reduce Motion.** With Reduce Motion on, values appear without counting up, cards appear
  without stagger and charts appear without draw-in.

## Constraints

- Data only through the BFF's existing `/api/v1/*` routes with the Phase 1 mobile bearer; no new
  routes in `financial-consultant-web`, no change in `financial-consultant-api`.
- Recurring and installment occurrences can be "virtual" (no transaction id); the app must handle
  them as the web does.

## Edge cases & error handling

- **Cold API:** the first request after the API has been idle can take several seconds (≈ 20 s
  observed). Skeletons (F9) or cached data (F1) must cover it; no timeout error before the
  response arrives.
- **Session expiry mid-screen:** handled by the Phase 1 renewal rules; a successful renewal must
  not lose the screen's state (month, filters, scroll).
- **Month with no bills:** every section shows its empty state; KPIs show R$ 0,00.
- **Income-only or expense-only months:** "Saldo livre ⇄ % da entrada" shows "—" when there is no
  income; amounts and colours stay correct.
- **Bill without day:** treated as the web treats it (no due date shown; status follows the web's
  rule).
- **Duplicate identity request at launch:** the app must request the user identity once per launch
  (Phase 1 currently fires it twice).
- **Search plus filters:** filters apply on top of search results; the empty message distinguishes
  "no search match" from "no filter match".

## Success criteria

- For the same account and month, Painel and Contas on iOS show the **same bills, statuses and
  totals** as the web (spot-checked on at least the current month and one past month with paid,
  overdue and projected bills).
- With the app killed and relaunched, Painel shows data instantly from the device, then refreshes.
- With the BFF unreachable, cached screens remain usable with the offline notice; uncached screens
  offer "Tentar novamente".
- Signing out and signing in with another account shows none of the previous account's data.
- Every requirement above is covered by an automated test (status derivation, KPIs, bucketing,
  formatting) or a documented manual check on the Simulator.

## Resolved questions

- **"Por categoria" scope (resolved 2026-10-04):** follow the web exactly — the web sums `|amount|`
  of **all** the month's transactions per category (income included), top 6. The earlier
  assumption that the web uses expenses only was wrong.
