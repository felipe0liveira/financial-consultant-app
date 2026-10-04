# Phased Plan — iOS App

> Roadmap for `financial-consultant-app`. Each phase is shipped through the workspace's
> spec-driven flow (`write-spec` → `write-plan` → `execute-plan`). Phases that touch `-api` or
> `-web` get **one spec + one plan per repo**, all approved before implementation starts.

## Goals

1. Run on **iOS** first (developed on macOS, distributed via TestFlight).
2. **Feature parity with the web** ([`01-web-feature-inventory.md`](01-web-feature-inventory.md)).
3. **Reuse the existing API** — no business logic in the app.
4. **Google sign-in only.** The same Google account sees the same data on web and iOS.
5. **No landing page.** The login screen is the signed-out home.

## Non-goals (for now)

- Android (keep the door open — see D2), iPad-optimised layouts, widgets, Apple Watch.
- Final name, logo and App Store listing (blocked on naming).
- Features the web doesn't have yet (reconciliation, goal editing — see inventory §13).
- Offline writes.

---

## Decisions

| ID | Decision | Status |
|---|---|---|
| D1 | Auth: **Option A — BFF as mobile gateway** | ✅ Decided 2026-10-04 |
| D2 | Tech: **Expo / React Native + TypeScript** | ✅ Decided 2026-10-04 |
| D3 | Minimum iOS version: **iOS 17+** | ✅ Decided 2026-10-04 |
| D4 | Push delivery (APNs vs FCM) | Open — before Phase 5 |

### D1 — How the iOS app authenticates — ✅ decided: Option A

Today the API admits only the web BFF ([`02-api-and-auth.md`](02-api-and-auth.md) §1). The app
must never embed `WEB_API_SECRET`.

| Option | Summary | Repos touched |
|---|---|---|
| **A. BFF as mobile gateway** *(chosen)* | iOS uses Google Sign-In with an **iOS OAuth client**, sends the Google ID token to a new BFF endpoint (e.g. `POST /api/auth/mobile`). The BFF verifies it (issuer, audience = iOS client ID, signature, expiry), then issues its own signed **bearer token** (same claims as the web session). BFF `/api/v1/*` handlers accept that bearer in addition to the cookie and forward to the API exactly as today. | `-web` only |
| B. API verifies Google ID tokens | API gains a Google ID-token verifier and the iOS client ID config; requires reopening Cloud Run ingress or putting a gateway in front, since end-user tokens can't pass `run.invoker`. | `-api` + infra |

**Why A:** zero changes to the API's trust model or Cloud Run IAM, secrets stay server-side, the
iOS app reuses the BFF's already-camelCased contract, and the BFF already owns OAuth by design.
Cost: one extra network hop (same region, negligible).

Still open for the spec: bearer lifetime (web uses 7 days, no refresh) and whether to add a refresh
mechanism (iOS can silently re-run Google Sign-In to mint a fresh token).

### D2 — App technology — ✅ decided: Expo

| Option | Fit |
|---|---|
| **Expo / React Native + TypeScript** *(chosen)* | Same language as the web; pure helpers (`lib/money.ts`, `lib/bills.ts` status derivation, category inference, TanStack Query patterns) can be ported almost verbatim; Android later is cheap. Native Google Sign-In and APNs available via well-maintained modules; builds on the Mac with Xcode. Renders native UIKit views — **no WebView**. Google Sign-In requires a development build (not Expo Go). |
| SwiftUI (native) | Best platform feel and smallest runtime; all logic rewritten in Swift; Android would be a second app. |

### D3 — Minimum iOS version — ✅ decided: iOS 17+ (2026-10-04)

iOS 17+, inside the supported range of the current Expo SDK (which itself requires Xcode 26.4+ to build).

### D4 — Push delivery

APNs directly from the API vs. Firebase Cloud Messaging (FCM, already on GCP, also covers
Android later). Decide before Phase 5.

---

## Phases

### Phase 0 — Foundations & decisions
- ~~Close D3~~ (D1, D2 and D3 are decided); write a `CLAUDE.md` for this repo.
- Create the **iOS OAuth client** in GCP project `financial-consultant-501119` (same project as
  the web client, so `sub` matches).
- Specs + plans: `-web` mobile auth endpoint + bearer support; `-app` Expo scaffold + sign-in.
- Apple Developer account / bundle id (`TBD` until naming; use a placeholder id).

**Exit:** decisions recorded in `docs/`, all Phase 1 specs/plans approved.

### Phase 1 — Skeleton & sign-in
- `-web`: implement the mobile auth endpoint and bearer acceptance on `/api/v1/*`.
- App scaffold, environments (local BFF, production), design tokens, Bitter font, light/dark/system.
- **Login screen as home** ("Entrar com Google"); session stored in the **Keychain**.
- Navigation shell (tab bar: Painel, Contas, Grupos, Recorrentes, Mais → Categorias, Relatórios, Ajustes).
- Settings: profile (name/email/avatar from Google claims, initials fallback), appearance, **Sair**.
- `GET /me`, 401 handling ("Sua sessão expirou…" → back to login), cache-owner guard.

**Exit:** a web user signs in on the simulator and the app shows their `user_id`-scoped data shell.

### Phase 2 — Read core: Painel & Contas — ✅ delivered 2026-10-04
- Dashboard: header, KPI cards (flip, count-up), "Gastos do mês" chart (3/6/9), "Contas a pagar".
- Contas: month stepper, KPIs, status derivation, buckets, grouping, filters sheet, search, pagination.
- Bill details sheet.
- Persisted query cache (instant load), pull-to-refresh, refetch on foreground, offline banner.

**Exit:** the same month looks identical on web and iOS for the same account.

### Phase 3 — Write core: bills
- Nova conta (installment `N/M` shortcut, recurring + backfill, currency mask, inline new category).
- Editar conta with recurring scope and installment series rules.
- Pay / un-pay, delete (incl. "Excluir parcelamento?"), convert to recurring.
- **409 ambiguous** disambiguation and 409 duplicate handling.
- Select mode + quick sum + add to group.
- Optimistic updates + haptics on pay/delete.

**Exit:** every bill action available on the web works on iOS.

### Phase 4 — Secondary screens
- Grupos (list, detail, settle, CRUD).
- Recorrentes (list, deactivated section, edit, convert, deactivate, delete).
- Categorias & orçamentos.
- Relatórios (fechamento, ano, previsão, parcelas, metas).

**Exit:** full web parity minus notifications and import.

### Phase 5 — Notifications
- In-app notifications list + unread badge (works with the existing API).
- Native push: `-api` gains device-token registration and an APNs/FCM sender in the due-bill
  sweep (spec + plan in `-api`; BFF proxy routes in `-web`).
- Settings toggle with permission states; tap → deep link to the bill's month.

**Exit:** due-bill reminders arrive on the device.

### Phase 6 — Import & release
- Spreadsheet import via the iOS document picker (`.xlsx`/`.csv`, ≤ 5 MB) + review screen.
- Polish pass (accessibility, Dynamic Type, Reduce Motion, empty/error states).
- TestFlight build; App Store submission deferred until the product is named.

**Exit:** TestFlight build with full web parity.

---

## Cross-repo work summary

| Phase | `-api` | `-web` | `-app` |
|---|---|---|---|
| 0 | — | spec/plan: mobile auth | decisions, CLAUDE.md |
| 1 | — | mobile auth endpoint + bearer | scaffold, login, shell, settings |
| 2–4 | — | — | screens |
| 5 | device tokens + native push sender | proxy routes for device tokens | notifications |
| 6 | — | — | import, release |


## Side follow-ups found while mapping (not part of this plan)

- Refresh the stale `CLAUDE.md` files in `-api` (households, `web_<sub>`) and `-web` (ID-token gate,
  missing mockup file).
