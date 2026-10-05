# Plan: Nova Conta — Create Bills (Phase 3b)

**Execution mode:** subagent-driven, with one fresh agent per task and a review between tasks.
Task 6 is a manual check on the Simulator and runs **inline**, because it acts on the user's
production account.
**Spec:** `.sdd/specs/2026-10-05-nova-conta.md`

## Design decisions made here (spec left them to implementation)

- **Pure form logic lives in a new `src/domain/newBill.ts` module, ported from the web's
  `add-bill-form.tsx` and `use-create-bill.ts`.** This covers installment parsing, the backfill
  rule, validation, request building, the success title, hints, date formatting and error copy.
  - It matches the repo's existing split: pure domain logic is unit-tested and screens stay thin.
  - The form state is updated through one function, `updateNewBillForm`. It enforces the
    "backfill only when recurring + no marker + past month" invariant on every change, instead of
    scattering that logic across the event handlers the way the web does. The visible behaviour
    is the same as the web's.
- **Native controls come from `@expo/ui/swift-ui`**, which is already a dependency (57.0.21) and
  whose `ExpoUI` pod is already in the dev build, so no new native dependency is needed. The
  form uses two of its controls:
  - `Menu` with `Button` items for Categoria;
  - `DatePicker` for Data.

  `Alert.prompt` (an iOS-native React Native API) is used for the "Nova categoria…" name dialog.
- **The date row shows our own `dd/MM/aaaa` text. Tapping it expands a native SwiftUI
  `DatePicker` in `graphical` style, the iOS calendar, under the row.**
  - SwiftUI's `compact` style always renders the date in the system's medium format
    ("5 de out. de 2026"), which would break the spec's dd/MM/aaaa requirement.
  - Picking a day collapses the calendar again, as the web's popover does.
  - The picker gets the `pt_BR` locale through the `environment` modifier.
  - The spec was amended to "native iOS calendar" accordingly (spec commit amended).
- **Sheet:** a new root `Stack.Screen name="new-bill"`.
  - It uses `presentation: "formSheet"` with `sheetAllowedDetents: [1.0]` (the large detent)
    and the grabber visible.
  - "Cancelar", "Nova conta" and "Salvar" sit in a top bar inside the content. The root stack
    uses `headerShown: false`, like `bill-details`.
  - Content is a `ScrollView` with `automaticallyAdjustKeyboardInsets`, so the focused field is
    never hidden. It also uses `keyboardShouldPersistTaps="handled"` and
    `keyboardDismissMode="interactive"`.
- **Discard confirmation uses React Navigation's `usePreventRemove`**, re-exported by
  `expo-router/react-navigation`.
  - Expo Router's native stack passes `preventNativeDismiss` to the sheet whenever removal is
    prevented. A swipe-down then fires `onNativeDismissCancelled`, which goes through the same
    `beforeRemove` callback as "Cancelar" (`router.back()`), so one code path covers both
    gestures.
  - Removal is prevented while the form is dirty or saving. The callback ignores the attempt
    while saving, and shows the "Descartar esta conta?" alert when the form is dirty.
- **Errors inside the form are shown inline, not as a toast.**
  - The global toast is rendered under the root navigator, so a native form sheet covers it.
  - Validation, duplicate, offline, server and category-creation errors therefore appear in an
    inline alert box in the form.
  - Only the success message ("Conta criada" etc.) uses the footer toast, because by then the
    sheet has closed.
  - The offline copy is `OFFLINE_MESSAGE` from 3a, as the spec asks.
- **Offline check:** the form checks `onlineManager.isOnline()` before calling the server.
  - Both mutations also use `networkMode: "always"`, so a connection lost mid-request rejects
    with `NetworkError` (mapped to the offline copy) instead of TanStack pausing the mutation
    and leaving "Salvando…" stuck forever.
- **Cache refresh after create:** invalidate every `["month"]`, `["month-transactions"]` and
  `["bills-search"]` query, not only the chosen month's. Recurring rules, installment series and
  backfills all touch several months, and invalidating every query is what the series delete in
  3a already does.
- **Categories:**
  - `useCategories()` reads `GET /api/v1/categories` under the web's key `["categories"]`. The
    route returns a bare `string[]`.
  - The picker shows `mergeCategories(catalog, DEFAULT_CATEGORIES, [selected])`, which is the
    web's formula.
  - "Already exists (ignoring case)" is resolved locally against that merged list first, with no
    request. If the name is new, `POST /api/v1/categories` runs (idempotent upstream). The result
    `name` is selected and merged into the `["categories"]` cache, then the query is invalidated.
- **Duplicate detection** matches `/409|duplicate/i` against the error message plus the BFF body,
  because the BFF reports the upstream 409 as a 500 with the status in the text. This mirrors
  `classifyActionError` and the web's `toPtBrMessage`. A separate classifier is used because, for
  actions, 409 means "ambiguous", not "duplicate".
- **Painel's default month** is `currentMonth()`. Contas passes the month it currently shows.
  The month travels as the `month` route parameter.

---

### Task 1 — Domain logic for the Nova conta form

**Files:** `src/domain/newBill.ts` (new), `src/domain/__tests__/newBill.test.ts` (new), `src/api/types.ts` (modified)

- [ ] Append the request and response types to `src/api/types.ts`:

```ts
/** Body of POST /api/v1/transactions — mirrors the web's CreateBillInput (lib/api.ts). */
export interface CreateBillInput {
  month: string; // "YYYY-MM"
  day: number;
  category: string;
  description: string;
  /** Positive magnitude in reais; `direction` decides the sign server-side. */
  amount: number;
  direction: BillDirection;
  recurring: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentBackfillPaid?: boolean;
  recurringBackfillPaid?: boolean;
}

/** Result of POST /api/v1/categories (idempotent: an existing name returns already_exists). */
export interface AddCategoryResult {
  status: string;
  name: string;
  already_exists?: boolean;
}
```

- [ ] Create `src/domain/newBill.ts`:

```ts
import { NetworkError, SessionExpiredError } from "../api/client";
import type { BillDirection, CreateBillInput } from "../api/types";
import { OFFLINE_MESSAGE } from "./billActions";
import { centsToReals } from "./money";

/** A trailing installment marker found in a bill title (ported from the web's add-bill-form). */
export interface ParsedInstallment { clean: string; current: number; total: number }

/**
 * "Passagens aéreas 3/5" → { clean: "Passagens aéreas", current: 3, total: 5 }.
 * Only a whitespace-preceded marker at the very end counts; requires 1 ≤ N ≤ M, M ≥ 2 and a
 * non-empty title — otherwise the description is taken verbatim (spec 11, 12).
 */
export function parseInstallment(value: string): ParsedInstallment | null {
  const match = value.match(/\s(\d{1,3})\s*\/\s*(\d{1,3})\s*$/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (total < 2 || current < 1 || current > total) return null;
  const clean = value.slice(0, match.index).trim();
  if (!clean) return null;
  return { clean, current, total };
}

export interface NewBillForm {
  category: string;
  description: string;
  direction: BillDirection;
  /** Integer cents; null = empty field. */
  cents: number | null;
  date: Date;
  recurring: boolean;
  backfillPaid: boolean;
}

export const DEFAULT_NEW_BILL_CATEGORY = "Contas";

/** "2026-10" for a local date. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Local midnight of the 1st of a "YYYY-MM" month. */
export function firstOfMonth(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** Defaults (spec 4–10): Contas, Saída, empty value, the 1st of `month`, switches off. */
export function initialNewBillForm(month: string): NewBillForm {
  return {
    category: DEFAULT_NEW_BILL_CATEGORY,
    description: "",
    direction: "out",
    cents: null,
    date: firstOfMonth(month),
    recurring: false,
    backfillPaid: false,
  };
}

/** "Já venho pagando desde então" is offered only for a recurring, non-installment, past start month (spec 10). */
export function canBackfill(form: NewBillForm, currentMonth: string): boolean {
  return form.recurring && !parseInstallment(form.description) && monthKey(form.date) < currentMonth;
}

/** Applies a change and drops a backfill choice that is no longer offered (spec 10, edge cases). */
export function updateNewBillForm(form: NewBillForm, patch: Partial<NewBillForm>, currentMonth: string): NewBillForm {
  const next = { ...form, ...patch };
  if (!canBackfill(next, currentMonth)) next.backfillPaid = false;
  return next;
}

/** True when anything differs from the form's initial state (spec 18). */
export function isNewBillDirty(form: NewBillForm, initial: NewBillForm): boolean {
  return (
    form.category !== initial.category ||
    form.description !== initial.description ||
    form.direction !== initial.direction ||
    form.cents !== initial.cents ||
    form.date.getTime() !== initial.date.getTime() ||
    form.recurring !== initial.recurring ||
    form.backfillPaid !== initial.backfillPaid
  );
}

/** The web's validation copy (spec 14); null when the form can be saved. */
export function validateNewBill(form: NewBillForm): string | null {
  const parsed = parseInstallment(form.description);
  const description = parsed ? parsed.clean : form.description.trim();
  if (!description) return "Informe uma descrição para a conta.";
  if (form.cents === null || form.cents <= 0) return "Informe um valor válido maior que zero.";
  return null;
}

/** The POST /transactions body for a validated form — the web's handleSubmit (spec 10, 11). */
export function buildCreateBillInput(form: NewBillForm, currentMonth: string): CreateBillInput {
  const parsed = parseInstallment(form.description);
  const recurring = parsed ? false : form.recurring;
  return {
    month: monthKey(form.date),
    day: form.date.getDate(),
    category: form.category,
    description: parsed ? parsed.clean : form.description.trim(),
    amount: centsToReals(form.cents ?? 0),
    direction: form.direction,
    recurring,
    installmentCurrent: parsed?.current,
    installmentTotal: parsed?.total,
    installmentBackfillPaid: parsed ? true : undefined,
    recurringBackfillPaid: recurring ? canBackfill(form, currentMonth) && form.backfillPaid : undefined,
  };
}

/** Success toast (spec 16): installment wins, then Entrada, else Conta. */
export function createdMessage(input: CreateBillInput): string {
  if (input.installmentTotal !== undefined) return "Parcelamento criado";
  return input.direction === "in" ? "Entrada criada" : "Conta criada";
}

/** "05/10/2026". */
export function formatDateBR(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** "Repete todo dia 5, a partir de outubro de 2026." (spec 9). */
export function recurringHint(date: Date): string {
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `Repete todo dia ${date.getDate()}, a partir de ${month} de ${date.getFullYear()}.`;
}

/** The web's installment hint (spec 11). */
export function installmentHint(p: ParsedInstallment): string {
  return `Detectamos ${p.total} parcelas em “${p.clean}” — vamos cadastrar da 1 à ${p.total} (a ${p.current}ª é a atual). O valor é por parcela.`;
}

/** Existing category with the same name ignoring case, if any (spec 13). */
export function findCategory(options: readonly string[], name: string): string | null {
  const key = name.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === key) ?? null;
}

export const DUPLICATE_BILL_MESSAGE = "Já existe uma conta igual neste mês. Ajuste os dados ou tente novamente.";
const SESSION_MESSAGE = "Sua sessão expirou. Entre novamente para continuar.";

function errorText(error: unknown): string {
  const body = (error as { body?: { error?: string } } | null)?.body;
  return `${error instanceof Error ? error.message : String(error)} ${body?.error ?? ""}`;
}

/** pt-BR copy for a failed create (spec 17, duplicate edge case) — the web's toPtBrMessage. */
export function createBillErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE_MESSAGE;
  if (error instanceof SessionExpiredError) return SESSION_MESSAGE;
  const text = errorText(error);
  if (/409|duplicate/i.test(text)) return DUPLICATE_BILL_MESSAGE;
  if (/401|unauthorized/i.test(text)) return SESSION_MESSAGE;
  return "Não foi possível criar a conta. Tente novamente.";
}

/** pt-BR copy for a failed category creation — the web's use-categories wording. */
export function categoryErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE_MESSAGE;
  if (error instanceof SessionExpiredError) return SESSION_MESSAGE;
  return "Não foi possível salvar a categoria. Tente novamente.";
}
```

- [ ] Create `src/domain/__tests__/newBill.test.ts`:

```ts
import { ApiError, NetworkError, SessionExpiredError } from "../../api/client";
import { OFFLINE_MESSAGE } from "../billActions";
import {
  buildCreateBillInput, canBackfill, categoryErrorMessage, createBillErrorMessage, createdMessage,
  DUPLICATE_BILL_MESSAGE, findCategory, formatDateBR, initialNewBillForm, installmentHint, isNewBillDirty,
  parseInstallment, recurringHint, updateNewBillForm, validateNewBill, type NewBillForm,
} from "../newBill";

const NOW = "2026-10";
const form = (patch: Partial<NewBillForm> = {}): NewBillForm => ({ ...initialNewBillForm("2026-10"), ...patch });

describe("parseInstallment", () => {
  test("detects a trailing N/M", () => {
    expect(parseInstallment("Passagens aéreas 3/5")).toEqual({ clean: "Passagens aéreas", current: 3, total: 5 });
    expect(parseInstallment("Sofá 1 / 10 ")).toEqual({ clean: "Sofá", current: 1, total: 10 });
  });
  test.each(["1/2 kg de arroz", "3/5", "Compra 6/5", "Compra 1/1", "Compra 0/3", "Compra3/5"])("ignores %s", (v) => {
    expect(parseInstallment(v)).toBeNull();
  });
});

test("initial form defaults", () => {
  const f = initialNewBillForm("2026-08");
  expect(f).toMatchObject({ category: "Contas", description: "", direction: "out", cents: null, recurring: false, backfillPaid: false });
  expect(formatDateBR(f.date)).toBe("01/08/2026");
});

describe("backfill rule", () => {
  test("only for recurring + no marker + past month", () => {
    expect(canBackfill(form({ recurring: true, date: new Date(2026, 7, 5) }), NOW)).toBe(true);
    expect(canBackfill(form({ recurring: false, date: new Date(2026, 7, 5) }), NOW)).toBe(false);
    expect(canBackfill(form({ recurring: true, date: new Date(2026, 9, 5) }), NOW)).toBe(false);
    expect(canBackfill(form({ recurring: true, date: new Date(2026, 7, 5), description: "Curso 2/6" }), NOW)).toBe(false);
  });
  test("is dropped when no longer offered, recurring is kept", () => {
    const armed = form({ recurring: true, backfillPaid: true, date: new Date(2026, 7, 5) });
    expect(updateNewBillForm(armed, { date: new Date(2026, 10, 5) }, NOW).backfillPaid).toBe(false);
    expect(updateNewBillForm(armed, { recurring: false }, NOW).backfillPaid).toBe(false);
    const marked = updateNewBillForm(armed, { description: "Curso 2/6" }, NOW);
    expect(marked).toMatchObject({ backfillPaid: false, recurring: true });
    expect(updateNewBillForm(marked, { description: "Curso" }, NOW)).toMatchObject({ backfillPaid: false, recurring: true });
    expect(updateNewBillForm(form(), { backfillPaid: true }, NOW).backfillPaid).toBe(false);
  });
});

test("dirty detection", () => {
  const initial = initialNewBillForm("2026-10");
  expect(isNewBillDirty({ ...initial }, initial)).toBe(false);
  expect(isNewBillDirty({ ...initial, date: new Date(initial.date) }, initial)).toBe(false);
  expect(isNewBillDirty({ ...initial, description: "x" }, initial)).toBe(true);
  expect(isNewBillDirty({ ...initial, cents: 100 }, initial)).toBe(true);
  expect(isNewBillDirty({ ...initial, date: new Date(2026, 9, 2) }, initial)).toBe(true);
});

test("validation copy", () => {
  expect(validateNewBill(form({ description: "  ", cents: 100 }))).toBe("Informe uma descrição para a conta.");
  expect(validateNewBill(form({ description: "Luz", cents: null }))).toBe("Informe um valor válido maior que zero.");
  expect(validateNewBill(form({ description: "Luz", cents: 0 }))).toBe("Informe um valor válido maior que zero.");
  expect(validateNewBill(form({ description: "Luz", cents: 100 }))).toBeNull();
});

describe("request body", () => {
  test("one-off expense", () => {
    expect(buildCreateBillInput(form({ description: " Luz ", cents: 12050, date: new Date(2026, 9, 10) }), NOW)).toEqual({
      month: "2026-10", day: 10, category: "Contas", description: "Luz", amount: 120.5, direction: "out", recurring: false,
      installmentCurrent: undefined, installmentTotal: undefined, installmentBackfillPaid: undefined, recurringBackfillPaid: undefined,
    });
  });
  test("income", () => {
    expect(buildCreateBillInput(form({ description: "Salário", cents: 500000, direction: "in" }), NOW)).toMatchObject({ direction: "in", amount: 5000 });
  });
  test("recurring with and without backfill", () => {
    const past = form({ description: "Aluguel", cents: 100, recurring: true, date: new Date(2026, 7, 5) });
    expect(buildCreateBillInput({ ...past, backfillPaid: true }, NOW)).toMatchObject({ month: "2026-08", recurring: true, recurringBackfillPaid: true });
    expect(buildCreateBillInput(past, NOW)).toMatchObject({ recurring: true, recurringBackfillPaid: false });
  });
  test("installment wins over recurring", () => {
    expect(buildCreateBillInput(form({ description: "Passagens aéreas 3/5", cents: 100, recurring: true }), NOW)).toMatchObject({
      description: "Passagens aéreas", recurring: false, installmentCurrent: 3, installmentTotal: 5,
      installmentBackfillPaid: true, recurringBackfillPaid: undefined,
    });
  });
});

test("success titles", () => {
  const base = buildCreateBillInput(form({ description: "Luz", cents: 1 }), NOW);
  expect(createdMessage(base)).toBe("Conta criada");
  expect(createdMessage({ ...base, direction: "in" })).toBe("Entrada criada");
  expect(createdMessage({ ...base, direction: "in", installmentTotal: 5, installmentCurrent: 1 })).toBe("Parcelamento criado");
});

test("hints", () => {
  expect(recurringHint(new Date(2026, 9, 5))).toBe("Repete todo dia 5, a partir de outubro de 2026.");
  expect(installmentHint({ clean: "Passagens aéreas", current: 3, total: 5 })).toBe(
    "Detectamos 5 parcelas em “Passagens aéreas” — vamos cadastrar da 1 à 5 (a 3ª é a atual). O valor é por parcela."
  );
});

test("findCategory ignores case", () => {
  expect(findCategory(["Contas", "Lazer"], " lazer ")).toBe("Lazer");
  expect(findCategory(["Contas"], "Pets")).toBeNull();
});

test("error copy", () => {
  expect(createBillErrorMessage(new ApiError("API transactions failed: 500", 500, { error: "API error 409: duplicate" }))).toBe(DUPLICATE_BILL_MESSAGE);
  expect(createBillErrorMessage(new NetworkError())).toBe(OFFLINE_MESSAGE);
  expect(createBillErrorMessage(new SessionExpiredError())).toBe("Sua sessão expirou. Entre novamente para continuar.");
  expect(createBillErrorMessage(new ApiError("API transactions failed: 500", 500, { error: "boom" }))).toBe("Não foi possível criar a conta. Tente novamente.");
  expect(categoryErrorMessage(new ApiError("x", 500))).toBe("Não foi possível salvar a categoria. Tente novamente.");
  expect(categoryErrorMessage(new NetworkError())).toBe(OFFLINE_MESSAGE);
});
```

- [ ] Run: `bun run test -- src/domain/__tests__/newBill.test.ts`. Expected: all tests pass.
  If the `recurringHint` assertion fails only because the month name is empty or English, the
  test runtime lacks pt-BR ICU. In that case, check how `src/domain/__tests__/format.test.ts`
  asserts `formatMonthLong` and mirror that approach.
- [ ] Run: `bun run typecheck`. Expected: no errors.
- [ ] Commit: `git add src/domain/newBill.ts src/domain/__tests__/newBill.test.ts src/api/types.ts && git commit -m "feat: add nova conta form domain logic"`

---

### Task 2 — Create and category endpoints

**Files:** `src/api/endpoints.ts` (modified), `src/api/__tests__/endpoints.test.ts` (modified)
**Needs context from:** Task 1 — the `CreateBillInput` and `AddCategoryResult` types in `src/api/types.ts`

- [ ] Add `CreateBillInput` and `AddCategoryResult` to the type import in `src/api/endpoints.ts`,
  then append:

```ts
/** POST /transactions — create a bill, income, recurring rule or installment series. */
export function createTransaction(input: CreateBillInput): Promise<unknown> {
  return apiFetch("transactions", { method: "POST", body: JSON.stringify(input) });
}

/** GET /categories — the household's saved catalog (bare string[]). */
export function getCategories(): Promise<string[]> {
  return apiFetch<string[]>("categories");
}

/** POST /categories — add a category (idempotent upstream). */
export function addCategory(name: string): Promise<AddCategoryResult> {
  return apiFetch<AddCategoryResult>("categories", { method: "POST", body: JSON.stringify({ name }) });
}
```

- [ ] Add `addCategory`, `createTransaction` and `getCategories` to the test's import list, then
  append this test to `src/api/__tests__/endpoints.test.ts`:

```ts
test("create and category routes", async () => {
  const input = { month: "2026-10", day: 1, category: "Contas", description: "Luz", amount: 10, direction: "out" as const, recurring: false };
  await createTransaction(input);
  await getCategories();
  await addCategory("Pets");
  const c = (apiFetch as jest.Mock).mock.calls;
  expect(c[0]).toEqual(["transactions", { method: "POST", body: JSON.stringify(input) }]);
  expect(c[1]).toEqual(["categories"]);
  expect(c[2]).toEqual(["categories", { method: "POST", body: JSON.stringify({ name: "Pets" }) }]);
});
```

- [ ] Run: `bun run test -- src/api/__tests__/endpoints.test.ts && bun run typecheck`. Expected:
  pass. The typecheck needs Task 1's types to exist.
- [ ] Commit: `git add src/api/endpoints.ts src/api/__tests__/endpoints.test.ts && git commit -m "feat: add create transaction and category endpoints"`

---

### Task 3 — Query hooks for creating bills and categories

**Files:** `src/hooks/newBill.ts` (new)
**Needs context from:** Task 2 — `createTransaction`, `getCategories`, `addCategory` signatures

- [ ] Create `src/hooks/newBill.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addCategory, createTransaction, getCategories } from "../api/endpoints";
import { mergeCategories } from "../domain/bills";

const CATEGORIES_KEY = ["categories"] as const;

/** The saved category catalog (the web's ["categories"] query). */
export function useCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: getCategories });
}

/**
 * Adds a category; the returned name joins the cached catalog right away.
 * networkMode "always": a dropped connection rejects (NetworkError) instead of pausing forever.
 */
export function useAddCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addCategory,
    networkMode: "always",
    onSuccess: (res) => {
      qc.setQueryData<string[]>(CATEGORIES_KEY, (cur) => mergeCategories(cur, [res.name]));
      void qc.invalidateQueries({ queryKey: CATEGORIES_KEY });
    },
  });
}

/**
 * Creates a bill and refreshes every month view: recurring rules, installment series and
 * backfills span several months (spec 16). Not optimistic by decision (spec 15).
 */
export function useCreateBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTransaction,
    networkMode: "always",
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["month"] });
      void qc.invalidateQueries({ queryKey: ["month-transactions"] });
      void qc.invalidateQueries({ queryKey: ["bills-search"] });
    },
  });
}
```

- [ ] Run: `bun run typecheck && bun run lint`. Expected: no errors. This needs Task 2's endpoints.
- [ ] Commit: `git add src/hooks/newBill.ts && git commit -m "feat: add create bill and category query hooks"`

---

### Task 4 — Nova conta sheet (form, route, registration)

**Files:** `src/ui/bills/NewBillForm.tsx` (new), `src/app/new-bill.tsx` (new), `src/app/_layout.tsx` (modified)
**Needs context from:** Task 1 — the `newBill.ts` exports; Task 3 — `useCategories`, `useAddCategory`, `useCreateBill`

- [ ] Create `src/ui/bills/NewBillForm.tsx`:

```tsx
import { Button as SwiftButton, DatePicker, Divider, Host, Menu } from "@expo/ui/swift-ui";
import { datePickerStyle, environment } from "@expo/ui/swift-ui/modifiers";
import { onlineManager } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BillDirection } from "../../api/types";
import { OFFLINE_MESSAGE } from "../../domain/billActions";
import { currentMonth, DEFAULT_CATEGORIES, mergeCategories } from "../../domain/bills";
import { digitsToCents, formatCents } from "../../domain/money";
import {
  buildCreateBillInput, canBackfill, categoryErrorMessage, createBillErrorMessage, createdMessage, findCategory,
  formatDateBR, initialNewBillForm, installmentHint, isNewBillDirty, parseInstallment, recurringHint,
  updateNewBillForm, validateNewBill, type NewBillForm as FormState,
} from "../../domain/newBill";
import { useAddCategory, useCategories, useCreateBill } from "../../hooks/newBill";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useToast } from "../toast/ToastProvider";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.inkSoft, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * "Nova conta" form inside a large native form sheet (spec 3–18). Not optimistic: Salvar waits
 * for the server, then closes the sheet and toasts. Errors stay inline — the global toast sits
 * under the native sheet.
 */
export function NewBillForm({ month, onClose }: { month: string; onClose: () => void }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const toast = useToast();
  const createBill = useCreateBill();
  const addCategory = useAddCategory();
  const catalog = useCategories().data;

  const [initial] = useState(() => initialNewBillForm(month));
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const set = (patch: Partial<FormState>) => setForm((f) => updateNewBillForm(f, patch, currentMonth()));
  const installment = parseInstallment(form.description);
  const options = useMemo(() => mergeCategories(catalog, DEFAULT_CATEGORIES, [form.category]), [catalog, form.category]);
  const dirty = isNewBillDirty(form, initial);

  // Swipe-down and Cancelar both land here (spec 18); ignored while saving (spec 15).
  usePreventRemove((dirty || saving) && !done, ({ data }) => {
    if (saving) return;
    Alert.alert("Descartar esta conta?", undefined, [
      { text: "Continuar editando", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // Close only after usePreventRemove has been released by `done`.
  useEffect(() => {
    if (!done) return;
    onClose();
    toast({ message: done });
  }, [done, onClose, toast]);

  const save = async () => {
    if (saving) return;
    const invalid = validateNewBill(form);
    if (invalid) { setError(invalid); return; }
    if (!onlineManager.isOnline()) { setError(OFFLINE_MESSAGE); return; }
    setError(null);
    setSaving(true);
    const input = buildCreateBillInput(form, currentMonth());
    try {
      await createBill.mutateAsync(input);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(createdMessage(input));
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(createBillErrorMessage(e));
      setSaving(false);
    }
  };

  const createCategory = async (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const existing = findCategory(options, name);
    if (existing) { set({ category: existing }); return; }
    if (!onlineManager.isOnline()) { setError(OFFLINE_MESSAGE); return; }
    try {
      const res = await addCategory.mutateAsync(name);
      setError(null);
      set({ category: res.name || name });
    } catch (e) {
      setError(categoryErrorMessage(e));
    }
  };

  const askNewCategory = () =>
    Alert.prompt("Nova categoria", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Criar", onPress: (value?: string) => void createCategory(value ?? "") },
    ], "plain-text");

  const inputStyle = { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 16 } as const;
  const directionChip = (value: BillDirection, label: string) => {
    const on = form.direction === value;
    return (
      <Pressable
        key={value}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => set({ direction: value })}
        style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: on ? colors.panel : "transparent" }}
      >
        <Text style={{ color: on ? colors.ink : colors.inkSoft, fontWeight: on ? "700" : "500" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar" onPress={onClose} hitSlop={12} disabled={saving}>
          <Text style={{ color: colors.accent, fontSize: 16, opacity: saving ? 0.5 : 1 }}>Cancelar</Text>
        </Pressable>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>Nova conta</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={saving ? "Salvando…" : "Salvar"} accessibilityState={{ busy: saving, disabled: saving }} onPress={() => void save()} hitSlop={12} disabled={saving}>
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700", opacity: saving ? 0.6 : 1 }}>{saving ? "Salvando…" : "Salvar"}</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 24, gap: 18 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View pointerEvents={saving ? "none" : "auto"} style={{ gap: 18, opacity: saving ? 0.7 : 1 }}>
          <Field label="Categoria">
            <Host matchContents colorScheme={scheme} seedColor={colors.accent}>
              <Menu label={form.category} systemImage="chevron.up.chevron.down">
                {options.map((name) => (
                  <SwiftButton key={name} label={name} systemImage={name === form.category ? "checkmark" : undefined} onPress={() => set({ category: name })} />
                ))}
                <Divider />
                <SwiftButton label="Nova categoria…" systemImage="plus" onPress={askNewCategory} />
              </Menu>
            </Host>
          </Field>

          <Field label="Descrição">
            <TextInput
              value={form.description}
              onChangeText={(description) => set({ description })}
              placeholder="Ex.: Conta de luz"
              placeholderTextColor={colors.inkFaint}
              accessibilityLabel="Descrição"
              editable={!saving}
              style={inputStyle}
            />
            {installment ? <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{installmentHint(installment)}</Text> : null}
          </Field>

          <Field label="Tipo">
            <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 4 }}>
              {directionChip("out", "Saída")}
              {directionChip("in", "Entrada")}
            </View>
          </Field>

          <Field label="Valor (R$)">
            <TextInput
              value={form.cents === null ? "" : formatCents(form.cents)}
              onChangeText={(text) => set({ cents: digitsToCents(text) })}
              placeholder="R$ 0,00"
              placeholderTextColor={colors.inkFaint}
              keyboardType="number-pad"
              accessibilityLabel="Valor"
              editable={!saving}
              style={inputStyle}
            />
          </Field>

          <Field label="Data">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Data, ${formatDateBR(form.date)}`}
              onPress={() => setCalendarOpen((o) => !o)}
              style={inputStyle}
            >
              <Text style={{ color: colors.ink, fontSize: 16 }}>{formatDateBR(form.date)}</Text>
            </Pressable>
            {calendarOpen ? (
              <Host matchContents colorScheme={scheme} seedColor={colors.accent}>
                <DatePicker
                  selection={form.date}
                  displayedComponents={["date"]}
                  modifiers={[datePickerStyle("graphical"), environment({ key: "locale", value: "pt_BR" })]}
                  onDateChange={(date) => {
                    set({ date: new Date(date.getFullYear(), date.getMonth(), date.getDate()) });
                    setCalendarOpen(false);
                  }}
                />
              </Host>
            ) : null}
          </Field>

          <View style={{ gap: 6, opacity: installment ? 0.5 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, fontSize: 16 }}>Repetir todo mês</Text>
              <Switch
                accessibilityLabel="Repetir todo mês"
                value={installment ? false : form.recurring}
                disabled={!!installment}
                onValueChange={(recurring) => set({ recurring })}
                trackColor={{ true: colors.accent }}
              />
            </View>
            {form.recurring && !installment ? <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{recurringHint(form.date)}</Text> : null}
          </View>

          {canBackfill(form, currentMonth()) ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 16 }}>Já venho pagando desde então</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 13 }}>Marca os meses anteriores como pagos</Text>
              </View>
              <Switch
                accessibilityLabel="Já venho pagando desde então"
                value={form.backfillPaid}
                onValueChange={(backfillPaid) => set({ backfillPaid })}
                trackColor={{ true: colors.accent }}
              />
            </View>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={{ color: colors.danger, backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, overflow: "hidden" }}>
              {error}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
```

- [ ] Create `src/app/new-bill.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { currentMonth } from "../domain/bills";
import { NewBillForm } from "../ui/bills/NewBillForm";

/** Large native form sheet for creating a bill (spec 1–3). `month` sets the default date. */
export default function NewBill() {
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const onClose = useCallback(() => router.back(), [router]);
  return <NewBillForm month={params.month || currentMonth()} onClose={onClose} />;
}
```

- [ ] In `src/app/_layout.tsx`, register the sheet inside the signed-in `Stack.Protected`, right
  after `bill-details`:

```tsx
          <Stack.Screen
            name="new-bill"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [1.0],
              sheetGrabberVisible: true,
              contentStyle: { backgroundColor: colors.panel },
            }}
          />
```

- [ ] Run: `bun run typecheck && bun run lint && bun run test`. Expected: no errors, all tests
  pass. There are three things to check if they don't:
  - If `expo-router/react-navigation` does not export `usePreventRemove` in the typings, check
    `node_modules/expo-router/build/react-navigation/core/index.d.ts`, which exports it, and
    import it from the path the package exposes. Do not add `@react-navigation/native` as a
    dependency.
  - If `systemImage={undefined}` fails the `SFSymbol` type, build the props conditionally.
  - If `sheetAllowedDetents: [1.0]` is rejected, use `"large"`.
- [ ] Commit: `git add src/ui/bills/NewBillForm.tsx src/app/new-bill.tsx src/app/_layout.tsx && git commit -m "feat: add nova conta form sheet"`

---

### Task 5 — "+" entry point on Contas and Painel

**Files:** `src/ui/bills/NewBillButton.tsx` (new), `src/app/(tabs)/contas.tsx` (modified), `src/app/(tabs)/painel.tsx` (modified)
**Needs context from:** Task 4 — the `/new-bill` route and its `month` param

- [ ] Create `src/ui/bills/NewBillButton.tsx`:

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

/** Route of the Nova conta sheet (see src/app/new-bill.tsx). */
export const NEW_BILL_ROUTE = "/new-bill";

/** Round coral "+" that opens Nova conta with the date defaulting to the 1st of `month` (spec 1, 2). */
export function NewBillButton({ month }: { month: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nova conta"
      hitSlop={8}
      onPress={() => router.push({ pathname: NEW_BILL_ROUTE, params: { month } })}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
        backgroundColor: pressed ? colors.accentPressed : colors.accent,
      })}
    >
      <Ionicons name="add" size={26} color="#FFFFFF" />
    </Pressable>
  );
}
```

- [ ] In `src/app/(tabs)/contas.tsx`, import `NewBillButton` from `../../ui/bills/NewBillButton`.
  Replace the title line in `header`:

```tsx
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Contas</Text>
```

  with:

```tsx
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Contas</Text>
        <NewBillButton month={month} />
      </View>
```

- [ ] In `src/app/(tabs)/painel.tsx`, import `NewBillButton` from `../../ui/bills/NewBillButton`.
  Wrap the greeting `Text` in `header` in a row with the button, using the current month:

```tsx
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>
          Olá, {session ? firstName(session.profile) : ""}
        </Text>
        <NewBillButton month={month} />
      </View>
```

- [ ] Run: `bun run typecheck && bun run lint && bun run test`. Expected: no errors, all tests pass.
- [ ] Commit: `git add src/ui/bills/NewBillButton.tsx "src/app/(tabs)/contas.tsx" "src/app/(tabs)/painel.tsx" && git commit -m "feat: add nova conta entry point to contas and painel"`

---

### Task 6 — Simulator verification (inline, production account)

**Files:** none (verification only; any fix found becomes its own `fix:` commit)

Rule for this task: every bill, rule or category created here is removed before the task ends.
Recurring creation and "Nova categoria" creation are checked **only after asking the user in
chat**, because the app cannot undo them. They are cleaned up through the web: the user deletes
the rule and the category there, or approves using the BFF routes `DELETE /api/v1/recurring/{id}`
and `DELETE /api/v1/categories/{name}`.

- [ ] Run: `bunx expo run:ios`, with the web BFF running on `localhost:3000`. Expected: the app
  builds and opens signed in.
- [ ] Check the entry points:
  - Contas: move to the next month, tap "+", and confirm the date shows `01/<next month>/2026`.
  - Painel: tap "+" and confirm the date shows the 1st of the current month.
  - Confirm both open a tall sheet with "Cancelar / Nova conta / Salvar".
- [ ] Check without saving anything:
  - Saving empty shows "Informe uma descrição para a conta."
  - A description with no value shows "Informe um valor válido maior que zero."
  - Typing "Passagens aéreas 3/5" shows the installment hint and disables "Repetir todo mês".
  - Turning on "Repetir todo mês" shows the hint.
  - Picking a past month shows "Já venho pagando desde então".
  - Picking a future month hides it.
  - The keyboard never covers the focused field.
- [ ] Check the discard flow:
  - An untouched form closes with no prompt.
  - After typing, "Cancelar" and swipe-down both ask "Descartar esta conta?".
  - "Continuar editando" keeps the data; "Descartar" closes.
- [ ] Check offline: turn the Mac's network off, then tap "Salvar". Expected: an inline "Sem
  conexão…" message, and the form is unchanged. Turn the network back on.
- [ ] Create and clean up a one-off expense:
  - Create "Teste app 3b" in the current month for R$ 1,00. Expected: the sheet closes, the
    toast shows "Conta criada", and the bill appears in Contas and Painel.
  - Create it again with the same data. Expected: the duplicate message, with the form still
    open.
  - Cancel, then delete the bill with the app's swipe "Excluir".
- [ ] Create and clean up an installment purchase:
  - Create "Teste app 3b 2/3" for R$ 1,00. Expected: "Parcelamento criado", parcela 2/3 in this
    month, and parcela 1 shown as paid in the previous month.
  - Delete the whole series from the details sheet ("Excluir parcelamento").
- [ ] Ask the user before creating a recurring bill or a new category. If approved:
  - Create each one and check the toast and the lists.
  - Clean up as described in the rule above, then confirm nothing is left.
- [ ] Report to the user: what was verified, a screenshot of the form, and confirmation that
  every test record was removed.

---

## Self-review

**Spec coverage:**
- Req 1–2 (entry point and default month): Task 5. Task 4 reads the route param, and Task 1
  `initialNewBillForm` sets the default.
- Req 3 (tall sheet, top bar, keyboard): Task 4, both the layout options and the `ScrollView`
  props.
- Req 4 (categoria menu and merge): Task 4 `Menu` plus `mergeCategories`, and Task 3
  `useCategories`.
- Req 5–7 (descrição, tipo, valor mask): Task 4, using the Task 1 helpers and `money.ts`.
- Req 8 (date dd/MM/aaaa, native calendar, any month): Task 1 `formatDateBR` and `monthKey`, and
  Task 4 `DatePicker`.
- Req 9–10 (recurring hint, backfill visibility and reset): Task 1 `recurringHint`,
  `canBackfill` and `updateNewBillForm` with tests, and Task 4.
- Req 11–12 (installments): Task 1 `parseInstallment`, `installmentHint` and
  `buildCreateBillInput`, all tested.
- Req 13 (Nova categoria): Task 1 `findCategory` and Task 3 `useAddCategory`, with the
  `createCategory` flow in Task 4.
- Req 14 (validation): Task 1 `validateNewBill`, tested.
- Req 15 (not optimistic, "Salvando…", locked form): Task 4 `save`, which uses `pointerEvents`
  and `editable`.
- Req 16 (close, toast, refresh): Task 1 `createdMessage`, Task 3 invalidation, and Task 4's
  `done` effect.
- Req 17 (failure keeps the form): Task 4 catch branch.
- Req 18 (discard confirmation): Task 1 `isNewBillDirty` and Task 4 `usePreventRemove`.
- Edge cases:
  - Duplicate, offline, session and category failure: Task 1 error copy and Task 4.
  - Marker added or removed, and date moved forward: Task 1 `updateNewBillForm` tests.
- Success criteria: Task 6, manual, including cleanup.

**Placeholder scan:** none found.

**Type/contract consistency:**
- Task 2 imports `CreateBillInput` and `AddCategoryResult` exactly as Task 1 defines them.
- Task 3 uses `createTransaction(input)`, `getCategories()` and `addCategory(name)` as defined in
  Task 2.
- Task 4 uses every `newBill.ts` export named in Task 1, with matching signatures.
- `updateNewBillForm(form, patch, currentMonth)` and `buildCreateBillInput(form, currentMonth)`
  are both called with `currentMonth()`.
- Task 5 pushes `/new-bill` with a `month` param, which is what Task 4's route reads.

**Task sizing:**
- Task 4 touches 3 files and holds the largest component. It is kept together because the
  route, its registration and the form only make sense as one reviewable sheet.
- No other task is oversized.
