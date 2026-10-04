# API Surface & Authentication

> Source of truth: `financial-consultant-api` code as of 2026-10-04. Where the API's own
> `CLAUDE.md` disagrees with the code (household model, `web_<sub>` ids), **the code wins** —
> households were removed (`f33407f`) and user ids are now opaque (`62df915`).

The iOS app consumes the **same** `/api/v1/*` surface the web BFF uses. It must never
reimplement business logic. This document captures what that surface is and — critically —
why a native client **cannot call it today** without new work.

---

## 1. How the API authenticates callers today

There are two independent gates. **Both admit only the web BFF.**

### Gate 1 — Cloud Run IAM (edge)

- Service `financial-api` is deployed `--no-allow-unauthenticated --invoker-iam-check`
  (`financial-consultant-api/cloudbuild.yaml`).
- Caller must send `Authorization: Bearer <Google-signed OIDC identity token>` whose audience
  is the exact Cloud Run URL.
- `roles/run.invoker` is held only by two service accounts (`infra/setup_gcp.sh`):
  - `financial-web-runtime@…` — the web BFF
  - `financial-api-runtime@…` — the Cloud Scheduler job
- The BFF mints the token with `google-auth-library` `getIdTokenClient(API_BASE_URL)`
  (`financial-consultant-web/lib/api.ts`).

An end user's Google ID token is **not** a service-account identity with `run.invoker`, so a
direct call from iOS is rejected (401/403) before the container runs.

### Gate 2 — shared secret + asserted identity (application)

`require_web_identity` in `src/financial_api/web_api.py`, applied to every `/api/v1` route:

| Header | Meaning | Failure |
|---|---|---|
| `X-Web-Api-Secret` | Must equal `WEB_API_SECRET` (GSM `web-api-secret`) | `401 invalid web api secret` |
| `X-Web-Sub` | Raw Google `sub`, **trusted as asserted** — never verified | `401 missing google sub` |

The API holds **no** Google client ID, audience, or issuer config. OAuth lives entirely in the
web BFF (`GOOGLE_OAUTH_CLIENT_ID`/`SECRET`, session JWT signed with `SESSION_SECRET`).

### User identity resolution

- `hash_google_sub(sub, IDENTITY_HMAC_KEY)` → HMAC-SHA256 hex (`identity.py`).
- `get_or_create_google_user` (`firestore/users.py`) looks up `users where google_sub_hmac == digest`;
  on first login creates `users/{auto-id}` with `{google_sub_hmac, created_at, updated_at}`.
- `user_id` is that **opaque auto-id**. `GET /api/v1/me` returns it (and auto-provisions).
- **No email, name, or avatar is stored server-side — by design.** Profile data comes from the
  client's own Google session only. Persisting it would undo the unlink-identity spec
  (`.sdd/specs/2026-08-05-unlink-user-identity-design.md`).

### Why the same user sees the same data on iOS

Google's `sub` is per **Google account**, not per OAuth client. An iOS OAuth client created in
the same GCP project yields the same `sub` for the same person → same HMAC → same `user_id` →
same data. **Parity of data is automatic once the right `sub` reaches the API through a
trusted path.**

### Constraints for the mobile client

- **Never ship `WEB_API_SECRET` in the app binary.** Anyone extracting it could impersonate any
  user by setting `X-Web-Sub`.
- The iOS app therefore needs a trusted intermediary or a new verification path. Options are
  analysed in [`04-phased-plan.md`](04-phased-plan.md) (Phase 0 — Auth decision).

---

## 2. Conventions a client must respect

- Base path `/api/v1`. Month format `YYYY-MM`. Dates `YYYY-MM-DD`.
- **Amounts are signed floats**: expenses negative, income positive.
- **Writes match rows by description substring** (case-insensitive) plus optional
  `match_day` / `match_amount` — not by id. Ambiguity → `409` with `matches[]`; the client must
  offer a disambiguation UI.
- **Several DELETEs carry a JSON body**: `/transactions`, `/checkpoints`,
  `/groups/{id}/members`, `/push/unsubscribe`. The iOS HTTP layer must support this.
- Recurring rules and installment series are **projected on read** as virtual rows with
  `transaction_id: null`; they materialize only when touched.
- `GET /months/{month}` **creates** the month doc if missing (side-effecting GET).
- Cold starts are expected (`min-instances=0`, `max-instances=2`). No rate limiting, no CORS
  (irrelevant for native).

### Write envelope → HTTP status (`web_api_write.py::_envelope_response`)

| Envelope `status` | HTTP |
|---|---|
| `ok`, `listing`, none | 200 |
| `ambiguous` | 409 |
| `duplicate` (POST /transactions) | 409 |
| `nothing_matched` | 404 |
| `error`, `anchor_out_of_range`, bare `{error}` | 422 |

Validation errors: `422 {"detail": [...]}` (FastAPI/Pydantic). The full envelope is always the body.

---

## 3. Endpoint catalogue

### Identity
| Method | Path | Returns |
|---|---|---|
| GET | `/me` | `{user_id}` |

### Reads (`web_api_read.py`)
| Method | Path | Notes |
|---|---|---|
| GET | `/months/{month}` | Full month summary: balances (`balance`, `opening_balance`, `real_balance`, `projected_balance`), pending totals, `overview{}`, `paid_count`, `pending_count`, `transactions[]`, `latest_checkpoint`, `budgets[]` |
| GET | `/months/{month}/transactions?limit&cursor` | Paginated (`limit` ≤ 200, cursor = int offset) |
| GET | `/year/{year}` | Yearly summary |
| GET | `/transactions/search` | `min_amount`, `max_amount`, `category`, `description`, `comment`, `month`, `confirmed`, `summary` |
| GET | `/installments` | `{active[], finished[], summary{active_count, total_remaining_debt}}` |
| GET | `/forecast?base_month` | Next-month forecast |
| GET | `/insights/daily?date` | Daily insight |
| GET | `/insights/monthly/{month}` | Monthly insight |
| GET | `/budgets/{month}/status?category` | Budget status |
| GET | `/goals/status?month` | Goals progress (`on_track`, `monthly_needed`, …) |
| GET | `/recurring-rules?active` | `{items: RecurringRuleRecord[]}` |
| GET | `/categories` | `{items: string[]}` (pt-BR sorted) |
| GET | `/groups` | `{items: [{group_id, name, color, member_count}]}` |
| GET | `/groups/{group_id}?month` | Group rollup + transactions |
| GET | `/notifications?limit` | `{items[], unread}` |
| GET | `/push/vapid-public-key` | Web Push only — **not usable by iOS** |

### Writes (`web_api_write.py`)
| Method | Path | Body (summary) |
|---|---|---|
| POST | `/transactions` | `month, category, description, amount, day?, confirmed, installment_current?, installment_total?, installment_backfill_paid, comment?, force` |
| POST | `/transactions/confirm` | `month, description?, confirm_all` |
| PATCH | `/transactions` | match (`month, description, match_day?, match_amount?`) + changes |
| DELETE | `/transactions` *(body)* | `month, description, match_day?, match_amount?` |
| POST | `/transactions/convert-recurring` | match + `end_month?, note?` |
| POST | `/recurring` | `start_month, day, category, description, amount, confirmed, comment?, end_month?, note?` |
| PATCH | `/recurring/{rule_id}` | partial rule |
| DELETE | `/recurring/{rule_id}?hard` | soft (default) or hard |
| PATCH | `/series` | `kind: recurring\|installment`, `id`, `sign?`, `category?`, `description?`, `amount?`, `day?`, `scope?: future\|past\|all`, `anchor_month?` |
| DELETE | `/installments/{installment_id}` | — |
| PUT | `/budgets/{month}` | `action: set\|remove, category, limit?` |
| POST | `/goals` | `action: set\|remove, name, month, target?, monthly_contribution?, …` |
| POST | `/reconcile` | `month, reported_balance, date?, opening_balance?` |
| DELETE | `/checkpoints` *(body)* | `month, index?` |
| POST | `/categories` | `name` |
| DELETE | `/categories/{name}` | — |
| POST | `/groups` | `name, color` |
| PATCH | `/groups/{group_id}` | `name?, color?` (error key is `message`, not `error`) |
| DELETE | `/groups/{group_id}` | — |
| POST / DELETE | `/groups/{group_id}/members` | `month, description, match_day?, match_amount?` |
| POST | `/groups/{group_id}/settle` | `month, confirmed` |
| POST | `/notifications/read` | `id?` |
| POST | `/push/subscribe` | Web Push `{endpoint, keys{p256dh, auth}}` — **no APNs** |
| DELETE | `/push/unsubscribe` *(body)* | `endpoint` |

### Import (`web_api_import.py`)
| Method | Path | Notes |
|---|---|---|
| POST | `/import/preview` | multipart: `month` + `file` (`.xlsx`/`.csv`, ≤ 5 MB); Gemini-parsed, persists nothing |
| POST | `/import/confirm` | `month, items[]` |

---

## 4. Domain entities

| Entity | Key fields |
|---|---|
| Transaction | `transaction_id` (null if projected), `day?`, `category`, `description`, `amount` (signed), `confirmed`, `installment{current,total,id}?`, `comment`, `group_ids[]`, `recurring_rule_id?`, `skipped` |
| RecurringRule | `rule_id`, `category`, `description`, `amount`, `day`, `active`, `start_month`, `end_month?`, `note`, `group_ids[]` |
| InstallmentSeries | `installment_id`, `category`, `description`, `amount` (per installment), `day`, `total`, `first_month`, `group_ids[]` |
| Checkpoint | `checkpoint_id`, `date`, `reported_balance`, `expected_confirmed`, `expected_planned`, `diff`, `status: match\|shortfall\|surplus` |
| Goal | `name` (upsert key), `target`, `monthly_contribution`, `start_month`, `horizon_months?`, `recurring_rule_id?` |
| Group | `group_id`, `name`, `color` |
| Category | `name` (free string) |
| Notification | `id`, `type` (e.g. `due_bill`), `title`, `body`, `created_at`, `read`, `data{month, description, day}` |
| Month | `month`, `opening_balance?`, `budgets{category: limit}` |

---

## 5. Gaps that block or affect iOS

| Gap | Impact | Where it is addressed |
|---|---|---|
| No end-user token verification; IAM admits only the BFF | iOS cannot authenticate | Phase 0 |
| Push is Web Push/VAPID only | No native push notifications | Phase 4 |
| Header names are web-specific (`X-Web-*`) | Cosmetic; acceptable if traffic goes through the BFF | Phase 0 |
| Description-based matching on writes | iOS needs a 409 disambiguation sheet | Phase 2 |
