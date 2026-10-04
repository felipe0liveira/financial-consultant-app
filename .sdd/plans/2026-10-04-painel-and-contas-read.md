# Plan: Painel & Contas — Read Core (Phase 2)

**Execution mode:** subagent-driven (default).
**Spec:** `.sdd/specs/2026-10-04-painel-and-contas-read.md`
**Web source (port from):** `../financial-consultant-web` — `lib/bills.ts`, `lib/money.ts`,
`lib/search-query.ts`, `lib/api.ts` (types), `components/dashboard/*`, `components/bills/*`.

## Design decisions made here (spec left them to implementation)

- **Port, don't re-derive.** The web's pure modules are copied into `src/domain/` (`bills.ts`,
  `money.ts`) and `src/api/` (`search-query.ts`, types), changing only imports and the two
  colour helpers (Tailwind class strings → theme token keys). Status rules, bucketing, filters
  and KPIs then match the web by construction (spec S1, C2, C5; success criterion "same numbers").
- **"Por categoria" follows the web exactly:** it sums `|amount|` of **all** the month's
  transactions per category (income included), top 6. The spec's open question assumed
  expenses-only "as the web does" — the web actually includes income, so parity wins; flagged
  for the developer to confirm.
- **Data layer:** TanStack Query v5 + `@tanstack/react-query-persist-client` +
  `@tanstack/query-async-storage-persister` over AsyncStorage (already installed). `staleTime`
  30 s, `gcTime` 24 h, persister `maxAge` 24 h, `buster` "1" (spec F1–F3). `focusManager` wired to
  `AppState`, `onlineManager` to NetInfo (documented React Native setup). Retries: at most 2,
  never for `SessionExpiredError`; no request timeout, so a cold API (~20 s) just shows
  skeletons/cached data (spec edge case).
- **Query keys mirror the web:** `["month", m]` (summary; shared by Painel, chart history and the
  tab badge), `["month-transactions", m]` (infinite, Contas), `["bills-search", filters]`,
  `["groups"]`.
- **Owner guard (A1):** `signOutLocal` clears the query client and removes the persisted cache;
  after `/me`, the stored owner id (`fc-cache-owner`) is compared and the cache is cleared on a
  mismatch. Identity requests become single-flight (fixes the duplicate `/me` at launch).
- **Sheets:** React Native `Modal` with `presentationStyle="pageSheet"` — the native iOS sheet,
  drag-to-dismiss for free (spec D2), no new dependency.
- **Charts:** `react-native-svg` (installed via `expo install`) with hand-built area and donut
  paths; draw-in animation via React Native `Animated` (width reveal / opacity). No chart library —
  both charts are simple and a library would add native weight for no gain.
- **Motion:** Reanimated's `useReducedMotion()` (Reanimated 4.5 is already a dependency) gates
  count-up, stagger, flip and draw-in (spec M2). Count-up is a 600 ms ease-out JS animation; flip is
  a Reanimated `rotateY` with two faces.
- **"Agrupar por" persistence (C6):** AsyncStorage key `fc-contas-grouping`.
- **Painel → Contas:** "Ver detalhes ›" pushes `/contas?month=YYYY-MM`; Contas reads the param on
  focus and otherwise defaults to the current month.
- **Offline (F6–F8):** a single `useOnline()` hook over `onlineManager`. With data → banner
  "Sem conexão · mostrando os últimos dados salvos"; without data → "Sem conexão" + **Tentar
  novamente** (refetch); search offline → "A busca precisa de conexão com a internet."
- **Refresh notice (F4):** `useRefreshNotice(isFetching, hasData)` returns true only after a
  background fetch with data on screen has lasted > 400 ms.
- **Dates (S3):** all "today" comparisons use `new Date()` in the device's local zone, as the web.

---

### Task 1 — Dependencies

**Files:** `package.json` (modified), `bun.lock` (modified)

- [ ] Run: `bunx expo install @tanstack/react-query @tanstack/react-query-persist-client @tanstack/query-async-storage-persister react-native-svg`
- [ ] Run: `bunx expo install --check && bun run typecheck` — expect "Dependencies are up to date" and exit 0.
- [ ] `git commit -m "chore: add tanstack query, persistence and svg"`

---

### Task 2 — API types, search query and endpoints

**Files:** `src/api/types.ts` (new), `src/api/search-query.ts` (new), `src/api/endpoints.ts` (new), `src/api/__tests__/endpoints.test.ts` (new)

- [ ] Create `src/api/types.ts` by copying, verbatim, these declarations from
  `../financial-consultant-web/lib/api.ts`: `Transaction` (line 188), `MonthOverview`,
  `MonthSummary`, `BudgetEntry`, `MonthTransactionsPage`, `BillDirection` (line 490),
  `SearchTransactionRow`, `SearchTransactionsResult` (lines 674–692), `TransactionGroup`,
  `GroupsResponse` (lines 1723–1735). Keep their doc comments. Add a header comment:
  `/** Response types of the BFF /api/v1 routes — copied from financial-consultant-web/lib/api.ts. */`
- [ ] Create `src/api/search-query.ts` as a verbatim copy of `../financial-consultant-web/lib/search-query.ts`
  (it is pure; `URLSearchParams` is available in React Native).
- [ ] Create `src/api/endpoints.ts`:

```ts
import { apiFetch } from "./client";
import { searchTransactionsQuery, type SearchTransactionsFilters } from "./search-query";
import type {
  GroupsResponse,
  MonthSummary,
  MonthTransactionsPage,
  SearchTransactionsResult,
} from "./types";

export function getMonth(month: string): Promise<MonthSummary> {
  return apiFetch<MonthSummary>(`months/${encodeURIComponent(month)}`);
}

export function getMonthTransactions(month: string, cursor: string | null): Promise<MonthTransactionsPage> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch<MonthTransactionsPage>(`months/${encodeURIComponent(month)}/transactions${qs}`);
}

export function searchTransactions(filters: SearchTransactionsFilters): Promise<SearchTransactionsResult> {
  const qs = searchTransactionsQuery(filters);
  return apiFetch<SearchTransactionsResult>(`transactions/search${qs ? `?${qs}` : ""}`);
}

export function getGroups(): Promise<GroupsResponse> {
  return apiFetch<GroupsResponse>("groups");
}
```

- [ ] Create `src/api/__tests__/endpoints.test.ts`:

```ts
jest.mock("../client", () => ({ apiFetch: jest.fn().mockResolvedValue({}) }));
import { apiFetch } from "../client";
import { getGroups, getMonth, getMonthTransactions, searchTransactions } from "../endpoints";

const calls = () => (apiFetch as jest.Mock).mock.calls.map((c) => c[0]);
beforeEach(() => (apiFetch as jest.Mock).mockClear());

test("paths match the BFF routes", async () => {
  await getMonth("2026-10");
  await getMonthTransactions("2026-10", null);
  await getMonthTransactions("2026-10", "50");
  await searchTransactions({ month: "2026-10", description: "luz" });
  await getGroups();
  expect(calls()).toEqual([
    "months/2026-10",
    "months/2026-10/transactions",
    "months/2026-10/transactions?cursor=50",
    "transactions/search?description=luz&month=2026-10",
    "groups",
  ]);
});
```

- [ ] Run: `bun run test src/api && bun run typecheck` — expect pass.
- [ ] `git commit -m "feat(api): add month, transactions, search and groups endpoints"`

---

### Task 3 — Port the bills and money domain

**Files:** `src/domain/money.ts` (new), `src/domain/bills.ts` (new), `src/domain/__tests__/bills.test.ts` (new)
**Needs context from:** Task 2 — `Transaction`, `TransactionGroup`, `BillDirection` in `src/api/types.ts`; Task 4 — the `ColorToken` type in `src/theme/tokens.ts`

- [ ] Create `src/domain/money.ts` as a verbatim copy of `../financial-consultant-web/lib/money.ts`.
- [ ] Create `src/domain/bills.ts` as a copy of `../financial-consultant-web/lib/bills.ts` with
  exactly these changes:
  1. Imports become:

```ts
import type { BillDirection, Transaction, TransactionGroup } from "../api/types";
import type { ColorToken } from "../theme/tokens";
import { realsToCents, centsToReals } from "./money";
```

  2. Replace `billStatusColors` with:

```ts
/** Theme tokens for a given bill status pill. */
export function billStatusColors(status: BillStatus): { bg: ColorToken; text: ColorToken } {
  switch (status) {
    case "paid":
      return { bg: "okBg", text: "ok" };
    case "overdue":
      return { bg: "dangerBg", text: "danger" };
    case "due-today":
    case "this-week":
    case "upcoming":
      return { bg: "warnBg", text: "warn" };
    case "projected":
      // Muted / neutral: a history-preview, not a live obligation.
      return { bg: "hair", text: "inkSoft" };
  }
}
```

  3. Replace `categoryColors` with the same keyword rules, returning tokens:

```ts
/** Theme tokens for the category tile (background + icon), by keyword. */
export function categoryColors(category: string): { bg: ColorToken; text: ColorToken } {
  const key = category.toLowerCase();
  if (key.includes("moradia") || key.includes("aluguel") || key.includes("housing")) {
    return { bg: "catMoradiaBg", text: "catMoradia" };
  }
  if (
    key.includes("conta") || key.includes("internet") || key.includes("energia") ||
    key.includes("água") || key.includes("agua") || key.includes("utility")
  ) {
    return { bg: "catContasBg", text: "catContas" };
  }
  if (
    key.includes("lazer") || key.includes("academia") || key.includes("gym") ||
    key.includes("entretenimento") || key.includes("streaming")
  ) {
    return { bg: "catLazerBg", text: "catLazer" };
  }
  if (
    key.includes("transporte") || key.includes("carro") || key.includes("combustivel") ||
    key.includes("combustível") || key.includes("uber")
  ) {
    return { bg: "catTransporteBg", text: "catTransporte" };
  }
  return { bg: "accentBg", text: "accent" };
}
```

  4. Add, at the end (ported from `components/bills/bills-client.tsx` lines 97–112):

```ts
import type { SearchTransactionRow } from "../api/types";

/** Normalizes a search row into a Transaction so the same derivations apply. */
export function searchRowToTransaction(row: SearchTransactionRow): Transaction {
  return {
    transaction_id: "",
    user_id: "",
    day: row.day,
    category: row.category,
    description: row.description,
    amount: row.amount,
    confirmed: row.confirmed,
    installment: null,
    comment: row.comment,
    group_ids: row.group_ids,
    recurring_rule_id: null,
    skipped: row.skipped,
  };
}
```

  (Move that `import type` up with the other imports.) Every other function stays byte-identical.
- [ ] Create `src/domain/__tests__/bills.test.ts`:

```ts
import type { Transaction } from "../../api/types";
import {
  billStatusSentence, bucketBills, deriveContasKpis, filterBills, groupBillsByStatus,
  lastNMonths, toBillViewModels,
} from "../bills";

const today = new Date(2026, 9, 10); // 2026-10-10, local time
const tx = (p: Partial<Transaction>): Transaction => ({
  transaction_id: "t", user_id: "u", day: 10, category: "Contas", description: "Luz",
  amount: -100, confirmed: false, installment: null, comment: null, group_ids: [],
  recurring_rule_id: null, skipped: false, ...p,
});
const status = (p: Partial<Transaction>) => toBillViewModels([tx(p)], "2026-10", today)[0]?.status;

test("S1: status derivation", () => {
  expect(status({ confirmed: true })).toBe("paid");
  expect(status({ day: 5 })).toBe("overdue");
  expect(status({ day: 5, transaction_id: null })).toBe("projected");
  expect(status({ day: 10 })).toBe("due-today");
  expect(status({ day: 17 })).toBe("this-week");
  expect(status({ day: 18 })).toBe("upcoming");
});

test("S2: skipped rows are hidden", () => {
  expect(toBillViewModels([tx({ skipped: true })], "2026-10", today)).toHaveLength(0);
});

test("C5: status buckets follow the web order", () => {
  const bills = toBillViewModels(
    [tx({ day: 20, description: "a" }), tx({ day: 5, description: "b" }), tx({ confirmed: true, description: "c" }), tx({ day: 10, description: "d" })],
    "2026-10", today
  );
  expect(bucketBills(bills, "status", []).map((b) => b.key)).toEqual([
    "status:overdue", "status:due-today", "status:upcoming", "status:paid",
  ]);
});

test("C5: group mode puts ungrouped bills last without a heading", () => {
  const bills = toBillViewModels([tx({ group_ids: ["g1"] }), tx({ description: "x" })], "2026-10", today);
  const buckets = bucketBills(bills, "group", [{ group_id: "g1", name: "Casa", color: "coral", member_count: 1 }]);
  expect(buckets[0].label).toBe("Casa");
  expect(buckets[buckets.length - 1].label).toBeNull();
});

test("C4: filters by status and category", () => {
  const txs = [tx({ day: 5 }), tx({ confirmed: true, category: "Lazer" })];
  expect(filterBills(txs, { status: "paid", category: "all" }, "2026-10", today)).toHaveLength(1);
  expect(filterBills(txs, { status: "all", category: "Lazer" }, "2026-10", today)).toHaveLength(1);
});

test("C2: contas KPIs", () => {
  const k = deriveContasKpis(
    [tx({ amount: 1000, confirmed: true }), tx({ amount: -300 }), tx({ amount: -200, confirmed: true })],
    "2026-10", today
  );
  expect(k.recebido).toBe(1000);
  expect(k.aPagar).toBe(300);
  expect(k.pago).toBe(200);
  expect(k.saldoLivre).toBe(500);
  expect(k.saldoLivrePct).toBe(50);
  expect(deriveContasKpis([tx({ amount: -1 })], "2026-10", today).saldoLivrePct).toBeNull();
});

test("Painel groups unpaid bills by status", () => {
  const groups = groupBillsByStatus([tx({ day: 5 }), tx({ confirmed: true })], "2026-10", today);
  expect(groups.map((g) => g.status)).toEqual(["overdue", "paid"]);
});

test("D1: status sentence", () => {
  const [b] = toBillViewModels([tx({ day: 5 })], "2026-10", today);
  expect(billStatusSentence(b)).toMatch(/^Venceu .* · atrasado há 5 dias$/);
});

test("lastNMonths is oldest first", () => {
  expect(lastNMonths(3)).toHaveLength(3);
});
```

- [ ] Run: `bun run test src/domain` — expect pass. (Typecheck needs Task 4's `ColorToken`; if it has
  not landed yet, defer `bun run typecheck` to the final review.) If an assertion about an exact
  bucket key or sentence differs from what the ported web code produces, the **web code is the
  reference** — fix the test, never the ported logic.
- [ ] `git commit -m "feat(domain): port bill status, buckets, filters and KPIs from the web"`

---

### Task 4 — Theme tokens for categories and accents

**Files:** `src/theme/tokens.ts` (modified), `src/theme/__tests__/resolve-scheme.test.ts` (modified)

- [ ] In `palette.light` add (values from `docs/03-design-system.md`):
  `accentBg: "#FBE3DA", catMoradia: "#7C6FC4", catMoradiaBg: "#E9E4F6", catContas: "#3D82B0",
  catContasBg: "#DEECF4", catLazer: "#C0567F", catLazerBg: "#F6E0E8", catTransporte: "#2F927A",
  catTransporteBg: "#DBEFE9"`.
  In `palette.dark` add: `accentBg: "#3F2A22", catMoradia: "#B3A6EE", catMoradiaBg: "#322A4A",
  catContas: "#77B6DE", catContasBg: "#1F3547", catLazer: "#E68BB0", catLazerBg: "#402331",
  catTransporte: "#74C9AE", catTransporteBg: "#1E3A32"`.
- [ ] Below `export type Colors …` add:

```ts
/** A key of the colour palette — what domain helpers return instead of raw colours. */
export type ColorToken = keyof Colors;
```

- [ ] Append to `src/theme/__tests__/resolve-scheme.test.ts`:

```ts
import { palette } from "../tokens";

test("light and dark palettes expose the same tokens", () => {
  expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
});
```

- [ ] Run: `bun run test src/theme && bun run typecheck` — expect pass (typecheck may report
  Task 3 files only if Task 3 is mid-flight; defer then).
- [ ] `git commit -m "feat(theme): add category and accent-tint tokens"`

---

### Task 5 — Formatting helpers

**Files:** `src/domain/format.ts` (new), `src/domain/__tests__/format.test.ts` (new)

- [ ] Create `src/domain/format.ts` (spec M1, P1):

```ts
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
```

- [ ] Create `src/domain/__tests__/format.test.ts`:

```ts
import { addMonths, formatBRL, formatBRL0, formatMonthLong, formatPct } from "../format";

const norm = (s: string) => s.replace(/ /g, " ");

test("BRL with and without decimals", () => {
  expect(norm(formatBRL(1234.5))).toBe("R$ 1.234,50");
  expect(norm(formatBRL0(1234.5))).toBe("R$ 1.235");
});
test("month label", () => expect(formatMonthLong("2026-09")).toBe("Setembro de 2026"));
test("addMonths across years", () => {
  expect(addMonths("2026-12", 1)).toBe("2027-01");
  expect(addMonths("2026-01", -1)).toBe("2025-12");
});
test("percent", () => expect(formatPct(12.345)).toBe("12,3%"));
```

- [ ] Run: `bun run test src/domain/__tests__/format.test.ts` — expect pass.
- [ ] `git commit -m "feat(domain): add pt-BR money and date formatting"`

---

### Task 6 — Query client, persistence, providers and owner guard

**Files:** `src/query/client.ts` (new), `src/query/QueryProvider.tsx` (new), `src/app/_layout.tsx` (modified), `src/auth/AuthProvider.tsx` (modified)

- [ ] Create `src/query/client.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { SessionExpiredError } from "../api/client";

export const STALE_TIME_MS = 30 * 1000; // spec F2
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // spec F3
export const CACHE_BUSTER = "1";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      gcTime: CACHE_MAX_AGE_MS,
      retry: (count, error) => !(error instanceof SessionExpiredError) && count < 2,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "fc-query-cache",
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

AppState.addEventListener("change", (status) => focusManager.setFocused(status === "active"));

/** Drops every cached query, in memory and on disk (owner guard, spec A1). */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
```

- [ ] Create `src/query/QueryProvider.tsx`:

```tsx
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { PropsWithChildren } from "react";
import { CACHE_BUSTER, CACHE_MAX_AGE_MS, persister, queryClient } from "./client";

export function QueryProvider({ children }: PropsWithChildren) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: CACHE_BUSTER }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
```

- [ ] In `src/app/_layout.tsx`, wrap `AuthProvider` with `QueryProvider` (inside `ThemeProvider`):

```tsx
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
```

  and add `import { QueryProvider } from "../query/QueryProvider";`.
- [ ] In `src/auth/AuthProvider.tsx`:
  1. Add imports `import AsyncStorage from "@react-native-async-storage/async-storage";` and
     `import { clearQueryCache } from "../query/client";`, and a constant
     `const CACHE_OWNER_KEY = "fc-cache-owner";`.
  2. In `signOutLocal`, before `clearSession()`, add:
     `await clearQueryCache().catch(() => {}); await AsyncStorage.removeItem(CACHE_OWNER_KEY).catch(() => {});`
  3. Make `loadIdentity` single-flight and owner-aware — replace its body with:

```tsx
  const identityInFlight = useRef<Promise<void> | null>(null);
  const loadIdentity = useCallback((): Promise<void> => {
    if (!sessionRef.current) return Promise.resolve();
    if (identityInFlight.current) return identityInFlight.current;
    const gen = generation.current;
    identityInFlight.current = (async () => {
      try {
        const me = await apiFetch<{ user_id: string }>("me");
        if (gen !== generation.current) return;
        const owner = await AsyncStorage.getItem(CACHE_OWNER_KEY).catch(() => null);
        if (owner && owner !== me.user_id) await clearQueryCache().catch(() => {});
        await AsyncStorage.setItem(CACHE_OWNER_KEY, me.user_id).catch(() => {});
        setUserId(me.user_id);
      } catch {
        // Offline or transient: identity is re-fetched on the next foreground.
      } finally {
        identityInFlight.current = null;
      }
    })();
    return identityInFlight.current;
  }, []);
```

     (Declare `identityInFlight` with the other refs at the top of the component, not inside the
     callback; the snippet shows it adjacent for readability.)
- [ ] Run: `bun run typecheck && bun run lint && bun run test` — expect pass (21+ tests).
- [ ] `git commit -m "feat(query): add persisted query cache with owner guard"`

---

### Task 7 — Data hooks

**Files:** `src/hooks/data.ts` (new), `src/hooks/useDebouncedValue.ts` (new), `src/hooks/status.ts` (new), `src/hooks/__tests__/status.test.ts` (new)
**Needs context from:** Task 2 — endpoint functions and types; Task 3 — `groupBillsByStatus`, `lastNMonths`, `currentMonth`; Task 6 — `onlineManager` wiring

- [ ] Create `src/hooks/data.ts`:

```ts
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { getGroups, getMonth, getMonthTransactions, searchTransactions } from "../api/endpoints";
import type { SearchTransactionsFilters } from "../api/search-query";
import type { MonthTransactionsPage } from "../api/types";
import { groupBillsByStatus } from "../domain/bills";

export function useMonth(month: string) {
  return useQuery({ queryKey: ["month", month], queryFn: () => getMonth(month) });
}

/** Month summary + bills grouped by status (Painel, tab badge). */
export function useBills(month: string) {
  const query = useMonth(month);
  const groups = query.data ? groupBillsByStatus(query.data.transactions ?? [], month, new Date()) : undefined;
  return { ...query, groups };
}

export function useMonthHistory(months: string[]) {
  return useQueries({
    queries: months.map((month) => ({ queryKey: ["month", month], queryFn: () => getMonth(month) })),
  });
}

export function useMonthTransactions(month: string) {
  const query = useInfiniteQuery({
    queryKey: ["month-transactions", month],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => getMonthTransactions(month, pageParam),
    getNextPageParam: (last: MonthTransactionsPage) => last.next_cursor,
  });
  return { ...query, transactions: (query.data?.pages ?? []).flatMap((p) => p.items) };
}

export function useSearchBills(filters: SearchTransactionsFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["bills-search", filters],
    queryFn: () => searchTransactions(filters),
    enabled,
  });
}

export function useGroups() {
  return useQuery({ queryKey: ["groups"], queryFn: getGroups });
}
```

- [ ] Create `src/hooks/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from "react";

/** Returns `value` once it has stopped changing for `delayMs` (search: 300 ms, spec C3). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] Create `src/hooks/status.ts`:

```ts
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

export const REFRESH_NOTICE_DELAY_MS = 400; // spec F4

/** True while the app believes it is online (NetInfo via onlineManager). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline()
  );
}

/** Pure rule behind the refresh notice, exported for tests. */
export function shouldShowRefreshNotice(isFetching: boolean, hasData: boolean, elapsedMs: number): boolean {
  return isFetching && hasData && elapsedMs > REFRESH_NOTICE_DELAY_MS;
}

/** "Atualizando dados…" only after a background refresh with data on screen exceeds 400 ms. */
export function useRefreshNotice(isFetching: boolean, hasData: boolean): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!(isFetching && hasData)) { setShow(false); return; }
    const id = setTimeout(() => setShow(true), REFRESH_NOTICE_DELAY_MS + 1);
    return () => clearTimeout(id);
  }, [isFetching, hasData]);
  return show;
}
```

- [ ] Create `src/hooks/__tests__/status.test.ts`:

```ts
import { shouldShowRefreshNotice } from "../status";

test("F4: refresh notice only after 400 ms of a background refresh with data", () => {
  expect(shouldShowRefreshNotice(true, true, 401)).toBe(true);
  expect(shouldShowRefreshNotice(true, true, 399)).toBe(false);
  expect(shouldShowRefreshNotice(true, false, 1000)).toBe(false);
  expect(shouldShowRefreshNotice(false, true, 1000)).toBe(false);
});
```

- [ ] Run: `bun run test src/hooks && bun run typecheck` — expect pass (typecheck depends on Tasks 2, 3, 6).
- [ ] `git commit -m "feat(hooks): add month, transactions, search and groups queries"`

---

### Task 8 — Feedback UI: skeleton, offline, refresh notice

**Files:** `src/ui/Skeleton.tsx` (new), `src/ui/OfflineBanner.tsx` (new), `src/ui/OfflineEmpty.tsx` (new), `src/ui/RefreshNotice.tsx` (new)
**Needs context from:** Task 7 — `useOnline()` and `useRefreshNotice()` (the `Button` used here is Phase 1's `src/ui/Button.tsx`)

- [ ] Create `src/ui/Skeleton.tsx` (F9):

```tsx
import { useEffect, useRef } from "react";
import { Animated, type DimensionValue } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";

export function Skeleton({ height, width = "100%", radius = 12 }: { height: number; width?: DimensionValue; radius?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return <Animated.View accessibilityLabel="Carregando" style={{ height, width, borderRadius: radius, backgroundColor: colors.hair, opacity }} />;
}
```

- [ ] Create `src/ui/OfflineBanner.tsx` (F6):

```tsx
import { Text, View } from "react-native";
import { useOnline } from "../hooks/status";
import { useTheme } from "../theme/ThemeProvider";

export function OfflineBanner() {
  const online = useOnline();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.warnBg, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12 }}>
      <Text style={{ color: colors.warn, fontSize: 14 }}>Sem conexão · mostrando os últimos dados salvos</Text>
    </View>
  );
}
```

- [ ] Create `src/ui/OfflineEmpty.tsx` (F7):

```tsx
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";

export function OfflineEmpty({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12, padding: 32 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", color: colors.ink }}>Sem conexão</Text>
      <Text style={{ color: colors.inkSoft, textAlign: "center" }}>Verifique sua conexão com a internet e tente novamente.</Text>
      <Button label="Tentar novamente" variant="secondary" onPress={onRetry} />
    </View>
  );
}
```

- [ ] Create `src/ui/RefreshNotice.tsx` (F4):

```tsx
import { ActivityIndicator, Text, View } from "react-native";
import { useRefreshNotice } from "../hooks/status";
import { useTheme } from "../theme/ThemeProvider";

export function RefreshNotice({ isFetching, hasData }: { isFetching: boolean; hasData: boolean }) {
  const show = useRefreshNotice(isFetching, hasData);
  const { colors } = useTheme();
  if (!show) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", paddingVertical: 4 }}>
      <ActivityIndicator size="small" color={colors.inkSoft} />
      <Text style={{ color: colors.inkSoft, fontSize: 13 }}>Atualizando dados…</Text>
    </View>
  );
}
```

- [ ] Run: `bun run typecheck && bun run lint` — expect pass (depends on Task 7).
- [ ] `git commit -m "feat(ui): add skeleton, offline and refresh feedback"`

---

### Task 9 — Motion primitives: count-up and flip card

**Files:** `src/ui/CountUpText.tsx` (new), `src/ui/FlipCard.tsx` (new), `src/ui/countUp.ts` (new), `src/ui/__tests__/countUp.test.ts` (new)

- [ ] Create `src/ui/countUp.ts`:

```ts
export const COUNT_UP_MS = 600;
/** Ease-out cubic: fast start, gentle stop. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
/** Value shown at `elapsed` ms of a count-up from 0 to `target`. */
export function countUpValue(target: number, elapsed: number, duration = COUNT_UP_MS): number {
  return target * easeOutCubic(elapsed / duration);
}
```

- [ ] Create `src/ui/__tests__/countUp.test.ts`:

```ts
import { countUpValue } from "../countUp";

test("count-up starts at 0 and ends at the target", () => {
  expect(countUpValue(100, 0)).toBe(0);
  expect(countUpValue(100, 600)).toBe(100);
  expect(countUpValue(100, 9999)).toBe(100);
  expect(countUpValue(100, 300)).toBeGreaterThan(50);
});
```

- [ ] Create `src/ui/CountUpText.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Text, type TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { COUNT_UP_MS, countUpValue } from "./countUp";

/** Counts a number up on first display (spec P2); renders the final value with Reduce Motion (M2). */
export function CountUpText({ value, format, style }: { value: number; format: (n: number) => string; style?: TextStyle }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setShown(countUpValue(value, elapsed));
      if (elapsed < COUNT_UP_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <Text style={style} accessibilityLabel={format(value)}>{format(shown)}</Text>;
}
```

- [ ] Create `src/ui/FlipCard.tsx`:

```tsx
import { useState, type ReactNode } from "react";
import { Pressable, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";

/** Tap to flip between two faces (spec P2, C2). `initialBack` opens on the back face. */
export function FlipCard({ front, back, style, initialBack = false, label }: {
  front: ReactNode; back: ReactNode; style?: ViewStyle; initialBack?: boolean; label: string;
}) {
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(initialBack);
  const duration = reduced ? 0 : 500;
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: withTiming(flipped ? "180deg" : "0deg", { duration }) }],
    backfaceVisibility: "hidden",
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: withTiming(flipped ? "360deg" : "180deg", { duration }) }],
    backfaceVisibility: "hidden",
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Toque para alternar" onPress={() => setFlipped((f) => !f)} style={style}>
      <Animated.View style={frontStyle}>{front}</Animated.View>
      <Animated.View style={backStyle}>{back}</Animated.View>
    </Pressable>
  );
}
```

- [ ] Run: `bun run test src/ui && bun run typecheck` — expect pass.
- [ ] `git commit -m "feat(ui): add count-up text and flip card"`

---

### Task 10 — Bill row, status pill, category icon and details sheet

**Files:** `src/ui/bills/CategoryIcon.tsx` (new), `src/ui/bills/StatusPill.tsx` (new), `src/ui/bills/BillRow.tsx` (new), `src/ui/bills/BillDetailsSheet.tsx` (new)
**Needs context from:** Task 3 — `BillViewModel`, `billStatusColors`, `billStatusLabel`, `billStatusSentence`, `categoryColors`; Task 4 — category tokens; Task 5 — `formatBRL`

- [ ] Create `src/ui/bills/CategoryIcon.tsx` (icons per `docs/03-design-system.md`):

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { categoryColors } from "../../domain/bills";
import { useTheme } from "../../theme/ThemeProvider";

type IconName = keyof typeof Ionicons.glyphMap;
function iconFor(category: string): IconName {
  const k = category.toLowerCase();
  if (k.includes("moradia") || k.includes("aluguel")) return "home-outline";
  if (k.includes("energia")) return "flash-outline";
  if (k.includes("conta") || k.includes("internet") || k.includes("água") || k.includes("agua")) return "wifi-outline";
  if (k.includes("lazer") || k.includes("academia") || k.includes("streaming")) return "barbell-outline";
  if (k.includes("transporte") || k.includes("carro") || k.includes("uber")) return "car-outline";
  return "pricetag-outline";
}

export function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  const { colors } = useTheme();
  const c = categoryColors(category);
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors[c.bg], alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={iconFor(category)} size={size * 0.5} color={colors[c.text]} />
    </View>
  );
}
```

- [ ] Create `src/ui/bills/StatusPill.tsx`:

```tsx
import { Text, View } from "react-native";
import { billStatusColors, billStatusLabel, type BillViewModel } from "../../domain/bills";
import { useTheme } from "../../theme/ThemeProvider";

export function StatusPill({ bill }: { bill: BillViewModel }) {
  const { colors } = useTheme();
  const c = billStatusColors(bill.status);
  return (
    <View style={{ backgroundColor: colors[c.bg], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: colors[c.text], fontSize: 12, fontWeight: "600" }}>{billStatusLabel(bill)}</Text>
    </View>
  );
}
```

- [ ] Create `src/ui/bills/BillRow.tsx` (C7; `showPill` lets Painel/Contas decide):

```tsx
import { Pressable, Text, View } from "react-native";
import type { TransactionGroup } from "../../api/types";
import type { BillViewModel } from "../../domain/bills";
import { formatBRL } from "../../domain/format";
import { useTheme } from "../../theme/ThemeProvider";
import { CategoryIcon } from "./CategoryIcon";
import { StatusPill } from "./StatusPill";

export function BillRow({ bill, groups = [], hideGroupId = null, showPill, onPress }: {
  bill: BillViewModel; groups?: TransactionGroup[]; hideGroupId?: string | null; showPill: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const chips = groups.filter((g) => bill.group_ids.includes(g.group_id) && g.group_id !== hideGroupId);
  const hints = [bill.recurring_rule_id ? "Recorrente" : null, bill.installment ? `Parcela ${bill.installment.current}/${bill.installment.total}` : null].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bill.description}, ${formatBRL(Math.abs(bill.amount))}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
    >
      <CategoryIcon category={bill.category} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, color: colors.ink }}>{bill.description}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.inkSoft }}>
          {[bill.category, ...hints].join(" · ")}
          {chips.length ? ` · ${chips.slice(0, 2).map((g) => g.name).join(", ")}${chips.length > 2 ? ` +${chips.length - 2}` : ""}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"], color: bill.amount > 0 ? colors.ok : colors.ink }}>
          {formatBRL(Math.abs(bill.amount))}
        </Text>
        {showPill ? <StatusPill bill={bill} /> : null}
      </View>
    </Pressable>
  );
}
```

- [ ] Create `src/ui/bills/BillDetailsSheet.tsx` (D1, D2 — read-only, native page sheet):

```tsx
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { TransactionGroup } from "../../api/types";
import { billStatusSentence, type BillViewModel } from "../../domain/bills";
import { formatBRL } from "../../domain/format";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";

function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function BillDetailsSheet({ bill, groups = [], onClose }: { bill: BillViewModel | null; groups?: TransactionGroup[]; onClose: () => void }) {
  const { colors } = useTheme();
  const tags = bill ? [
    bill.category,
    bill.recurring_rule_id ? "Recorrente" : null,
    bill.installment ? `Parcela ${bill.installment.current}/${bill.installment.total}` : null,
    ...groups.filter((g) => bill.group_ids.includes(g.group_id)).map((g) => g.name),
  ].filter((t): t is string => !!t) : [];
  return (
    <Modal visible={!!bill} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {bill ? (
        <ScrollView style={{ backgroundColor: colors.panel }} contentContainerStyle={{ padding: 24, gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>Detalhes da conta</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.accent, fontSize: 16 }}>Fechar</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "600", color: colors.ink }}>{bill.description}</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: bill.amount > 0 ? colors.ok : colors.ink }}>{formatBRL(Math.abs(bill.amount))}</Text>
          <Text style={{ fontSize: 16, color: colors.inkSoft }}>{billStatusSentence(bill)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{tags.map((t) => <Tag key={t} label={t} />)}</View>
          {bill.comment ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "600", color: colors.ink }}>Comentário</Text>
              <Text style={{ color: colors.inkSoft }}>{bill.comment}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Modal>
  );
}
```

- [ ] Run: `bun run typecheck && bun run lint` — expect pass (depends on Tasks 3–5).
- [ ] `git commit -m "feat(ui): add bill row, status pill and read-only details sheet"`

---

### Task 11 — Charts

**Files:** `src/ui/charts/geometry.ts` (new), `src/ui/charts/AreaChart.tsx` (new), `src/ui/charts/DonutChart.tsx` (new), `src/ui/charts/__tests__/geometry.test.ts` (new)
**Needs context from:** Task 1 — `react-native-svg` installed; Task 5 — `formatBRL0`, `formatMonthShort`

- [ ] Create `src/ui/charts/geometry.ts`:

```ts
/** SVG path for an area chart: points spread evenly across width, scaled to max. */
export function areaPath(values: number[], width: number, height: number): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, height - (v / max) * height] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pts[pts.length - 1][0]).toFixed(1)},${height} L0,${height} Z`;
  return { line, area };
}

/** Donut arcs as [startAngle, endAngle] in radians, clockwise from 12 o'clock. */
export function donutArcs(values: number[]): [number, number][] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  let a = -Math.PI / 2;
  return values.map((v) => {
    const start = a;
    a += (v / total) * Math.PI * 2;
    return [start, a];
  });
}

/** SVG path of a donut segment between two angles. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = end - start;
  const large = sweep > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end - 1e-6), y2 = cy + r * Math.sin(end - 1e-6);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}
```

- [ ] Create `src/ui/charts/__tests__/geometry.test.ts`:

```ts
import { areaPath, donutArcs } from "../geometry";

test("area path spans the width", () => {
  const { line, area } = areaPath([0, 50, 100], 200, 100);
  expect(line.startsWith("M0.0,100.0")).toBe(true);
  expect(line.endsWith("L200.0,0.0")).toBe(true);
  expect(area.endsWith("Z")).toBe(true);
});
test("donut arcs cover a full turn", () => {
  const arcs = donutArcs([1, 1, 2]);
  expect(arcs).toHaveLength(3);
  expect(arcs[2][1] - arcs[0][0]).toBeCloseTo(Math.PI * 2);
  expect(donutArcs([0, 0])).toEqual([]);
});
```

- [ ] Create `src/ui/charts/AreaChart.tsx` (P3; draw-in over 1.4 s unless Reduce Motion):

```tsx
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";
import { areaPath } from "./geometry";

export function AreaChart({ values, labels, height = 140 }: { values: number[]; labels: string[]; height?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const reveal = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced || width === 0) { reveal.setValue(1); return; }
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 1400, useNativeDriver: false }).start();
  }, [values.join(","), width, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const { line, area } = areaPath(values, width, height);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Gráfico de gastos por mês">
      <Animated.View style={{ height, overflow: "hidden", width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#fill)" />
            <Path d={line} stroke={colors.accent} strokeWidth={2.5} fill="none" />
          </Svg>
        ) : null}
      </Animated.View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        {labels.map((l) => <Text key={l} style={{ color: colors.inkFaint, fontSize: 12 }}>{l}</Text>)}
      </View>
    </View>
  );
}
```

- [ ] Create `src/ui/charts/DonutChart.tsx` (P6):

```tsx
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { formatBRL0 } from "../../domain/format";
import { useTheme } from "../../theme/ThemeProvider";
import { arcPath, donutArcs } from "./geometry";

export interface DonutEntry { name: string; value: number; color: string }

export function DonutChart({ data, size = 140 }: { data: DonutEntry[]; size?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { fade.setValue(1); return; }
    Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [fade, reduced]);
  const arcs = donutArcs(data.map((d) => d.value));
  const r = size / 2 - 12;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <Animated.View style={{ opacity: fade }}>
        <Svg width={size} height={size}>
          {arcs.map(([s, e], i) => (
            <Path key={data[i].name} d={arcPath(size / 2, size / 2, r, s, e)} stroke={data[i].color} strokeWidth={20} fill="none" />
          ))}
        </Svg>
      </Animated.View>
      <View style={{ flex: 1, gap: 6 }}>
        {data.map((d) => (
          <View key={d.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.ink }}>{d.name}</Text>
            <Text style={{ color: colors.inkSoft, fontVariant: ["tabular-nums"] }}>{formatBRL0(d.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

- [ ] Run: `bun run test src/ui/charts && bun run typecheck && bun run lint` — expect pass.
- [ ] `git commit -m "feat(ui): add area and donut charts"`

---

### Task 12 — Painel derivations

**Files:** `src/features/painel/derive.ts` (new), `src/features/painel/__tests__/derive.test.ts` (new)
**Needs context from:** Task 3 — `BillGroup`, `BillViewModel`, `categoryColors`; Task 2 — `MonthSummary`

- [ ] Create `src/features/painel/derive.ts` (port of `components/dashboard/dashboard-client.tsx`
  lines 86–135 and `right-rail.tsx` lines 89–101):

```ts
import type { MonthSummary, Transaction } from "../../api/types";
import type { BillGroup, BillViewModel } from "../../domain/bills";

const sumOutflow = (bills: { amount: number }[]) => bills.reduce((s, b) => s + (b.amount < 0 ? b.amount : 0), 0);

export interface PainelKpis {
  totalExpenses: number; totalBills: number; paidAmount: number; paidBills: number;
  unpaidAmount: number; overdueAmount: number; overdueBills: number; pendingCount: number;
}

/** KPI figures exactly as the web dashboard computes them (paid/unpaid count expenses only). */
export function derivePainelKpis(groups: BillGroup[], summary: MonthSummary | undefined): PainelKpis {
  const overdue = groups.find((g) => g.status === "overdue");
  return {
    totalExpenses: Math.abs(summary?.overview?.total_expenses ?? 0),
    totalBills: groups.reduce((s, g) => s + g.bills.length, 0),
    paidAmount: Math.abs(groups.filter((g) => g.status === "paid").reduce((s, g) => s + sumOutflow(g.bills), 0)),
    paidBills: groups.find((g) => g.status === "paid")?.bills.length ?? 0,
    unpaidAmount: Math.abs(groups.filter((g) => g.status !== "paid").reduce((s, g) => s + sumOutflow(g.bills), 0)),
    overdueAmount: Math.abs(overdue ? sumOutflow(overdue.bills) : 0),
    overdueBills: overdue?.bills.length ?? 0,
    pendingCount: groups.filter((g) => g.status !== "paid").reduce((s, g) => s + g.bills.length, 0),
  };
}

/** "Próximos vencimentos": up to 4 unpaid bills, soonest day first (spec P5). */
export function upcomingBills(groups: BillGroup[], limit = 4): BillViewModel[] {
  return groups
    .filter((g) => g.status !== "paid")
    .flatMap((g) => g.bills)
    .sort((a, b) => a.day - b.day)
    .slice(0, limit);
}

/** "Por categoria": |amount| of every transaction per category, top 6 — same as the web rail (P6). */
export function categoryTotals(transactions: Transaction[], limit = 6): { name: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.skipped) continue;
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + Math.abs(tx.amount));
  }
  return [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, limit);
}

/** Chart series: expense magnitude per month, 0 while a month has not loaded. */
export function expenseSeries(summaries: (MonthSummary | undefined)[]): number[] {
  return summaries.map((s) => Math.abs(s?.overview?.total_expenses ?? 0));
}
```

  Before finalising, open `../financial-consultant-web/components/dashboard/dashboard-client.tsx`
  and `right-rail.tsx` and confirm each function matches the web (in particular whether the web's
  category totals skip `skipped` rows — the web reads `monthSummary.transactions`; if the API never
  returns skipped rows there, keep the guard, it is harmless). Adjust to the web if they differ.
- [ ] Create `src/features/painel/__tests__/derive.test.ts`:

```ts
import type { Transaction } from "../../../api/types";
import { groupBillsByStatus } from "../../../domain/bills";
import { categoryTotals, derivePainelKpis, upcomingBills } from "../derive";

const today = new Date(2026, 9, 10);
const tx = (p: Partial<Transaction>): Transaction => ({
  transaction_id: "t", user_id: "u", day: 20, category: "Contas", description: "x", amount: -100,
  confirmed: false, installment: null, comment: null, group_ids: [], recurring_rule_id: null, skipped: false, ...p,
});

test("P2: paid/unpaid count expenses only", () => {
  const txs = [tx({ amount: -100, confirmed: true }), tx({ amount: 500, confirmed: true }), tx({ amount: -50, day: 5 })];
  const k = derivePainelKpis(groupBillsByStatus(txs, "2026-10", today), undefined);
  expect(k.paidAmount).toBe(100);
  expect(k.unpaidAmount).toBe(50);
  expect(k.overdueBills).toBe(1);
});

test("P5: up to 4 upcoming, soonest first", () => {
  const txs = [25, 12, 30, 15, 18].map((day, i) => tx({ day, description: `b${i}` }));
  expect(upcomingBills(groupBillsByStatus(txs, "2026-10", today)).map((b) => b.day)).toEqual([12, 15, 18, 25]);
});

test("P6: top categories by absolute amount", () => {
  const out = categoryTotals([tx({ category: "A", amount: -10 }), tx({ category: "B", amount: 30 }), tx({ category: "A", amount: -5 })]);
  expect(out).toEqual([{ name: "B", value: 30 }, { name: "A", value: 15 }]);
});
```

- [ ] Run: `bun run test src/features/painel` — expect pass.
- [ ] `git commit -m "feat(painel): add dashboard derivations ported from the web"`

---

### Task 13 — Painel screen

**Files:** `src/app/(tabs)/painel.tsx` (modified), `src/features/painel/KpiCards.tsx` (new), `src/features/painel/Sections.tsx` (new)
**Needs context from:** Task 7 — `useBills`, `useMonthHistory`; Task 8 — `Skeleton`, `OfflineBanner`, `OfflineEmpty`, `RefreshNotice`; Task 9 — `CountUpText`, `FlipCard`; Task 10 — `BillRow`, `BillDetailsSheet`; Task 11 — `AreaChart`, `DonutChart`; Task 12 — `derivePainelKpis`, `upcomingBills`, `categoryTotals`, `expenseSeries`; Task 5 — formatters; Task 3 — `currentMonth`, `lastNMonths`, `BILL_GROUP_LABELS`, `categoryColors`

- [ ] Create `src/features/painel/KpiCards.tsx` (P2): three cards in a column; "Total do mês" uses
  `colors.accent` background with white text; "Pago" (`okBg`) is a `FlipCard` whose back shows
  `formatPct(paid / totalExpenses * 100)` + "do total do mês"; "A pagar" (`warnBg`) flips the same
  way, front subtitle `overdueAmount > 0 ? \`${formatBRL(overdueAmount)} em atraso\` : "Em dia"`.
  Values use `CountUpText` with `formatBRL`. Stagger: each card fades/translates in with
  `delay = index * 80` ms over 550 ms via Reanimated `FadeInUp.delay(i * 80).duration(550)` entering
  animation, skipped when `useReducedMotion()` is true. Card shape: `radii.card`, padding 18.
- [ ] Create `src/features/painel/Sections.tsx` exporting `SectionCard` (titled card), `ChartSection`
  (title "Gastos do mês", a 3/6/9 segmented selector, `AreaChart` with
  `labels = months.map(formatMonthShort)`, empty text "Nenhum dado disponível para este período."
  when every value is 0), `UnpaidSection` (title "Contas a pagar", "Ver detalhes ›" pressable calling
  `onSeeAll`, one bucket per unpaid status with heading `${BILL_GROUP_LABELS[status]} · ${count}`,
  `BillRow showPill={false}` rows, empty states per spec P4), `UpcomingSection` (title "Próximos
  vencimentos", date badge `DD` + short month, description, `formatBRL`; empty "Nenhuma conta
  pendente."), `CategorySection` (title "Por categoria", `DonutChart` with
  `color = colors[categoryColors(name).text]`; empty "Nenhum dado disponível.").
- [ ] Replace `src/app/(tabs)/painel.tsx`:

```tsx
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { firstName } from "../../auth/session";
import { useAuth } from "../../auth/AuthProvider";
import { currentMonth, lastNMonths, type BillViewModel } from "../../domain/bills";
import { formatHeaderDate } from "../../domain/format";
import { KpiCards } from "../../features/painel/KpiCards";
import { categoryTotals, derivePainelKpis, expenseSeries, upcomingBills } from "../../features/painel/derive";
import { CategorySection, ChartSection, UnpaidSection, UpcomingSection } from "../../features/painel/Sections";
import { useBills, useMonthHistory } from "../../hooks/data";
import { useOnline } from "../../hooks/status";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { BillDetailsSheet } from "../../ui/bills/BillDetailsSheet";
import { OfflineBanner } from "../../ui/OfflineBanner";
import { OfflineEmpty } from "../../ui/OfflineEmpty";
import { RefreshNotice } from "../../ui/RefreshNotice";
import { Skeleton } from "../../ui/Skeleton";

export default function Painel() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const router = useRouter();
  const online = useOnline();
  const month = currentMonth();
  const [range, setRange] = useState(3);
  const [selected, setSelected] = useState<BillViewModel | null>(null);
  const bills = useBills(month);
  const months = useMemo(() => lastNMonths(range), [range]);
  const history = useMonthHistory(months);
  const groups = bills.groups ?? [];
  const kpis = derivePainelKpis(groups, bills.data);
  const hasData = !!bills.data;

  const header = (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>
        Olá, {session ? firstName(session.profile) : ""}
      </Text>
      <Text style={{ color: colors.inkSoft }}>
        {formatHeaderDate(new Date())} · você tem {kpis.totalBills} contas este mês
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.panel }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void bills.refetch(); history.forEach((h) => void h.refetch()); }} />}
      >
        {header}
        <OfflineBanner />
        <RefreshNotice isFetching={bills.isFetching} hasData={hasData} />
        {!hasData && !online ? <OfflineEmpty onRetry={() => void bills.refetch()} /> : null}
        {!hasData && online ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={120} /><Skeleton height={90} /><Skeleton height={90} /><Skeleton height={180} />
          </View>
        ) : null}
        {bills.error && !hasData && online ? (
          <Text style={{ color: colors.danger }}>Não foi possível carregar os dados do mês: {bills.error.message}</Text>
        ) : null}
        {hasData ? (
          <>
            <KpiCards kpis={kpis} />
            <ChartSection
              months={months}
              values={expenseSeries(history.map((h) => h.data))}
              loading={history.some((h) => h.isLoading)}
              range={range}
              onRangeChange={setRange}
            />
            <UnpaidSection groups={groups.filter((g) => g.status !== "paid")} totalBills={kpis.totalBills} onSelect={setSelected} onSeeAll={() => router.push({ pathname: "/contas", params: { month } })} />
            <UpcomingSection bills={upcomingBills(groups)} />
            <CategorySection data={categoryTotals(bills.data?.transactions ?? [])} />
          </>
        ) : null}
      </ScrollView>
      <BillDetailsSheet bill={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
```

  `KpiCards` props: `{ kpis: PainelKpis }`. `ChartSection` props:
  `{ months: string[]; values: number[]; loading: boolean; range: number; onRangeChange: (n: number) => void }`.
  `UnpaidSection` props: `{ groups: BillGroup[]; totalBills: number; onSelect: (b: BillViewModel) => void; onSeeAll: () => void }`
  (`totalBills === 0` → "Nenhuma conta cadastrada para este mês."; else no unpaid →
  "Tudo pago por aqui. Nenhuma conta pendente neste mês."). `UpcomingSection`:
  `{ bills: BillViewModel[] }`. `CategorySection`: `{ data: { name: string; value: number }[] }`.
- [ ] Run: `bun run typecheck && bun run lint` — expect pass (depends on Tasks 3–12).
- [ ] `git commit -m "feat(painel): show the month dashboard with real data"`

---

### Task 14 — Contas: filters, grouping preference and month stepper

**Files:** `src/features/contas/groupingPref.ts` (new), `src/features/contas/MonthStepper.tsx` (new), `src/features/contas/FiltersSheet.tsx` (new), `src/features/contas/FilterChips.tsx` (new), `src/features/contas/__tests__/groupingPref.test.ts` (new)
**Needs context from:** Task 3 — `BillFilters`, `BillGroupingMode`, `BILL_STATUS_FILTERS`, `DEFAULT_BILL_FILTERS`, `activeFilterCount`; Task 5 — `formatMonthLong`, `addMonths`

- [ ] Create `src/features/contas/groupingPref.ts` (C6):

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BillGroupingMode } from "../../domain/bills";

const KEY = "fc-contas-grouping";
const MODES: BillGroupingMode[] = ["status", "category", "group"];

export function parseGrouping(raw: string | null): BillGroupingMode {
  return MODES.includes(raw as BillGroupingMode) ? (raw as BillGroupingMode) : "status";
}
export async function loadGrouping(): Promise<BillGroupingMode> {
  return parseGrouping(await AsyncStorage.getItem(KEY).catch(() => null));
}
export async function saveGrouping(mode: BillGroupingMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode).catch(() => {});
}
```

- [ ] Create `src/features/contas/__tests__/groupingPref.test.ts`:

```ts
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { loadGrouping, parseGrouping, saveGrouping } from "../groupingPref";

test("unknown values fall back to status", () => {
  expect(parseGrouping(null)).toBe("status");
  expect(parseGrouping("nope")).toBe("status");
});
test("C6: grouping round-trips through storage", async () => {
  await saveGrouping("category");
  expect(await loadGrouping()).toBe("category");
});
```

- [ ] Create `src/features/contas/MonthStepper.tsx` (C1): row with chevron-back / label
  `formatMonthLong(month)` / chevron-forward; props `{ month: string; onChange: (m: string) => void }`,
  calling `onChange(addMonths(month, ±1))`; buttons have accessibility labels "Mês anterior" /
  "Próximo mês".
- [ ] Create `src/features/contas/FiltersSheet.tsx` (C4): page-sheet `Modal` titled "Filtros" with
  sections "Agrupar por" (three-way segmented: Situação / Categoria / Grupo; Grupo disabled when
  `hasGroups` is false), "Situação" chips from `BILL_STATUS_FILTERS`, "Categoria" chips ("Todas
  categorias" + `categories`), footer with "Limpar" (resets the draft to `DEFAULT_BILL_FILTERS` and
  "status") and a primary `Button` labelled `Ver ${previewCount(draft)} contas`. Props:
  `{ visible: boolean; filters: BillFilters; grouping: BillGroupingMode; categories: string[]; hasGroups: boolean; previewCount: (f: BillFilters) => number; onApply: (f: BillFilters, g: BillGroupingMode) => void; onClose: () => void }`.
  The sheet edits a local draft; nothing changes until "Ver N contas".
- [ ] Create `src/features/contas/FilterChips.tsx`: renders one removable chip per active filter
  (status label / category name) with accessibility label `Remover filtro ${label}`; props
  `{ filters: BillFilters; onChange: (f: BillFilters) => void }`.
- [ ] Run: `bun run test src/features/contas && bun run typecheck && bun run lint` — expect pass.
- [ ] `git commit -m "feat(contas): add filters sheet, chips, month stepper and grouping preference"`

---

### Task 15 — Contas screen and KPIs

**Files:** `src/app/(tabs)/contas.tsx` (modified), `src/features/contas/ContasKpis.tsx` (new)
**Needs context from:** Task 7 — `useMonthTransactions`, `useSearchBills`, `useGroups`, `useDebouncedValue`; Task 14 — `MonthStepper`, `FiltersSheet`, `FilterChips`, `loadGrouping`/`saveGrouping`; Task 10 — `BillRow`, `BillDetailsSheet`; Task 9 — `FlipCard`, `CountUpText`; Task 8 — feedback UI; Task 3 — `toBillViewModels`, `filterBills`, `bucketBills`, `deriveContasKpis`, `searchRowToTransaction`, `currentMonth`, `DEFAULT_BILL_FILTERS`, `activeFilterCount`

- [ ] Create `src/features/contas/ContasKpis.tsx` (C2) with props `{ kpis: ContasKpis }`:
  horizontal `ScrollView` of cards — "Vence hoje" (only when `kpis.dueToday > 0`, `warnBg`,
  subtitle "Não deixe vencer"); `FlipCard` "A receber" ⇄ "Recebido" with
  `initialBack = kpis.aReceber === 0 && kpis.recebido > 0`; `FlipCard` "A pagar" ⇄ "Pago" with
  `initialBack = kpis.aPagar === 0 && kpis.pago > 0`; `FlipCard` "Saldo livre" (`ok` text when
  `saldoLivre >= 0`, else `danger`) ⇄ "% da entrada" showing
  `kpis.saldoLivrePct === null ? "—" : formatPct(kpis.saldoLivrePct)`. Values via `CountUpText`.
- [ ] Replace `src/app/(tabs)/contas.tsx`:

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  activeFilterCount, bucketBills, currentMonth, DEFAULT_BILL_FILTERS, deriveContasKpis, filterBills,
  searchRowToTransaction, toBillViewModels, type BillFilters, type BillGroupingMode, type BillViewModel,
} from "../../domain/bills";
import { ContasKpis } from "../../features/contas/ContasKpis";
import { FilterChips } from "../../features/contas/FilterChips";
import { FiltersSheet } from "../../features/contas/FiltersSheet";
import { loadGrouping, saveGrouping } from "../../features/contas/groupingPref";
import { MonthStepper } from "../../features/contas/MonthStepper";
import { useGroups, useMonthTransactions, useSearchBills } from "../../hooks/data";
import { useOnline } from "../../hooks/status";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { BillDetailsSheet } from "../../ui/bills/BillDetailsSheet";
import { BillRow } from "../../ui/bills/BillRow";
import { Button } from "../../ui/Button";
import { OfflineBanner } from "../../ui/OfflineBanner";
import { OfflineEmpty } from "../../ui/OfflineEmpty";
import { RefreshNotice } from "../../ui/RefreshNotice";
import { Skeleton } from "../../ui/Skeleton";

const SEARCH_MIN_CHARS = 2; // spec C3
const SEARCH_DEBOUNCE_MS = 300; // spec C3

export default function Contas() {
  const { colors } = useTheme();
  const online = useOnline();
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState(currentMonth());
  useFocusEffect(useCallback(() => { if (params.month) setMonth(params.month); }, [params.month]));

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const isSearching = debounced.length >= SEARCH_MIN_CHARS;
  const [filters, setFilters] = useState<BillFilters>(DEFAULT_BILL_FILTERS);
  const [grouping, setGrouping] = useState<BillGroupingMode>("status");
  useEffect(() => { void loadGrouping().then(setGrouping); }, []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<BillViewModel | null>(null);

  const monthQuery = useMonthTransactions(month);
  const search = useSearchBills({ month, description: debounced }, isSearching && online);
  const groupsQuery = useGroups();
  const groups = groupsQuery.data?.items ?? [];

  const active = useMemo(
    () => (isSearching ? (search.data?.transactions ?? []).map(searchRowToTransaction) : monthQuery.transactions),
    [isSearching, search.data, monthQuery.transactions]
  );
  const visible = useMemo(() => filterBills(active, filters, month, new Date()), [active, filters, month]);
  const effectiveGrouping = grouping === "group" && groups.length === 0 ? "status" : grouping;
  const buckets = useMemo(() => bucketBills(visible, effectiveGrouping, groups), [visible, effectiveGrouping, groups]);
  const kpis = useMemo(() => deriveContasKpis(monthQuery.transactions, month, new Date()), [monthQuery.transactions, month]);
  const categories = useMemo(
    () => [...new Set(monthQuery.transactions.map((t) => t.category))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [monthQuery.transactions]
  );
  const hasData = !!monthQuery.data;

  const emptyText = isSearching
    ? "Nenhuma conta encontrada para essa busca."
    : activeFilterCount(filters) > 0
      ? "Nenhuma conta com esses filtros."
      : "Nenhuma conta cadastrada para este mês.";

  const changeMonth = (m: string) => { setMonth(m); };

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }}>Contas</Text>
      <MonthStepper month={month} onChange={changeMonth} />
      <OfflineBanner />
      <RefreshNotice isFetching={monthQuery.isFetching} hasData={hasData} />
      {hasData ? <ContasKpis kpis={kpis} /> : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar contas…"
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Buscar contas"
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink, fontSize: 16 }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Filtros, ${activeFilterCount(filters)} ativos`} onPress={() => setSheetOpen(true)} style={{ padding: 10, backgroundColor: colors.card, borderRadius: 12 }}>
          <Ionicons name="options-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <FilterChips filters={filters} onChange={setFilters} />
      {isSearching && !online ? <Text style={{ color: colors.warn }}>A busca precisa de conexão com a internet.</Text> : null}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.panel }}>
      <SectionList
        contentContainerStyle={{ padding: 16 }}
        sections={buckets.map((b) => ({ key: b.key, title: b.label, groupId: b.groupId, data: b.bills }))}
        keyExtractor={(item, index) => `${item.selectionKey}:${index}`}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text style={{ marginTop: 12, fontWeight: "600", color: colors.inkSoft }}>{section.title} · {section.data.length}</Text>
          ) : <View style={{ height: 12 }} />
        }
        renderItem={({ item, section }) => (
          <BillRow
            bill={item}
            groups={groups}
            hideGroupId={section.groupId}
            showPill={effectiveGrouping !== "status" ? ["overdue", "due-today"].includes(item.status) : true}
            onPress={() => setSelected(item)}
          />
        )}
        ListEmptyComponent={
          !hasData && !online ? <OfflineEmpty onRetry={() => void monthQuery.refetch()} />
            : !hasData ? <View style={{ gap: 10 }}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></View>
            : monthQuery.error ? <Text style={{ color: colors.danger }}>Não foi possível carregar as contas: {monthQuery.error.message}</Text>
            : <Text style={{ color: colors.inkSoft, textAlign: "center", padding: 24 }}>{emptyText}</Text>
        }
        ListFooterComponent={
          !isSearching && monthQuery.hasNextPage ? (
            <Button label={monthQuery.isFetchingNextPage ? "Carregando…" : "Carregar mais"} variant="secondary" loading={monthQuery.isFetchingNextPage} onPress={() => void monthQuery.fetchNextPage()} />
          ) : null
        }
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void monthQuery.refetch(); void groupsQuery.refetch(); }} />}
        stickySectionHeadersEnabled={false}
      />
      <FiltersSheet
        visible={sheetOpen}
        filters={filters}
        grouping={grouping}
        categories={categories}
        hasGroups={groups.length > 0}
        previewCount={(f) => filterBills(active, f, month, new Date()).length}
        onApply={(f, g) => { setFilters(f); setGrouping(g); void saveGrouping(g); setSheetOpen(false); }}
        onClose={() => setSheetOpen(false)}
      />
      <BillDetailsSheet bill={selected} groups={groups} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
```

  Note: the web exits select mode and keeps filters when the month changes; with no select mode
  here, changing month only swaps the data (filters persist within the session).
- [ ] Run: `bun run typecheck && bun run lint && bun run test` — expect pass.
- [ ] `git commit -m "feat(contas): show the bills list with search, filters and grouping"`

---

### Task 16 — Contas tab badge

**Files:** `src/app/(tabs)/_layout.tsx` (modified)
**Needs context from:** Task 7 — `useBills`; Task 3 — `currentMonth`

- [ ] In `src/app/(tabs)/_layout.tsx`, inside `TabsLayout`, add:

```tsx
  const { groups } = useBills(currentMonth());
  const unpaid = (groups ?? []).filter((g) => g.status !== "paid").reduce((n, g) => n + g.bills.length, 0);
```

  and on the Contas screen options add `tabBarBadge: unpaid > 0 ? unpaid : undefined` and
  `tabBarBadgeStyle: { backgroundColor: colors.danger }`. Imports:
  `import { currentMonth } from "../../domain/bills";` and `import { useBills } from "../../hooks/data";`.
- [ ] Run: `bun run typecheck && bun run lint` — expect pass.
- [ ] `git commit -m "feat: show the unpaid count on the contas tab"`

---

### Task 17 — Docs and manual verification

**Files:** `CLAUDE.md` (modified), `docs/04-phased-plan.md` (modified)

- [ ] `CLAUDE.md`: add to Layout `src/domain/ (ported pure web logic: bills, money, format)`,
  `src/query/ (TanStack Query client + persistence)`, `src/hooks/ (data + status hooks)`,
  `src/features/ (screen-specific components and derivations)`; add an "Architecture" bullet:
  "Domain logic is ported from `financial-consultant-web/lib/*` — when the web changes a rule
  (status, buckets, KPIs), port the change here; the web is the reference."
- [ ] `docs/04-phased-plan.md`: mark Phase 2 as delivered (date) once the checks below pass.
- [ ] Run: `bun run typecheck && bun run lint && bun run test` — all pass.
- [ ] Manual on the Simulator, with the web BFF running locally (`MOBILE_OAUTH_CLIENT_IDS` set):
  - Painel: header, 3 KPIs (tap flips Pago/A pagar), chart 3/6/9, "Contas a pagar" buckets,
    "Próximos vencimentos", "Por categoria"; numbers equal the web dashboard for the same account
    (current month). Tap a row → details sheet; drag down closes it.
  - "Ver detalhes ›" → Contas on the current month.
  - Contas: month stepper (current + one past month with paid, overdue and projected bills) — same
    bills, statuses and KPI totals as the web's Contas page for that month; search ("lu" → results
    after a pause; one letter → no search); filters sheet "Ver N contas" count matches the result;
    chips remove filters; grouping by categoria/grupo; kill and relaunch → grouping kept, filters
    reset; "Carregar mais" when the month has more than one page.
  - Badge on Contas equals the number of unpaid bills of the current month.
  - Kill and relaunch → Painel renders instantly from cache, "Atualizando dados…" only if the
    refresh is slow.
  - Stop the BFF → banner "Sem conexão · mostrando os últimos dados salvos" on cached screens;
    navigate to a never-opened month → "Sem conexão" + Tentar novamente; type a search → "A busca
    precisa de conexão com a internet."
  - Settings → Reduce Motion on → no count-up, stagger or draw-in.
  - Sair → sign in again: no previous data flashes before the fresh load.
  - BFF log at launch: a single `/api/v1/me`.
- [ ] `git commit -m "docs: document the phase 2 data layer and mark phase 2 delivered"`

---

## Self-review

**Spec coverage:**
- P1 → Task 13 (header) + Task 5 (`formatHeaderDate`). P2 → Tasks 9, 12, 13. P3 → Tasks 11, 13 (3/6/9,
  default 3, empty text). P4 → Tasks 10, 13 (`UnpaidSection`, both empty states, "Ver detalhes ›").
  P5 → Task 12 (`upcomingBills`, limit 4) + Task 13. P6 → Task 12 (`categoryTotals`, top 6) + Task 11
  (donut) + Task 13. P7 → Task 13 (render order).
- C1 → Tasks 14 (`MonthStepper`), 15, 13 (route param). C2 → Tasks 3 (`deriveContasKpis`), 15
  (`ContasKpis`, initial faces). C3 → Tasks 7 (`useDebouncedValue`), 15 (2 chars / 300 ms, month-scoped).
  C4 → Task 14 (`FiltersSheet`, `FilterChips`) + Task 15. C5 → Task 3 (`bucketBills`) + tests.
  C6 → Task 14 (`groupingPref`) + test. C7 → Task 10 (`BillRow`) + Task 15 (pill rule). C8 → Task 15
  ("Carregar mais"). C9 → Task 15 (empty/error texts).
- S1, S2 → Task 3 (ported derivation + tests). S3 → `new Date()` local everywhere (Tasks 3, 12, 15).
- D1, D2 → Task 10 (`BillDetailsSheet`, page sheet, no actions).
- F1–F3 → Task 6 (persisted client, 30 s / 24 h / maxAge). F4 → Task 7 + Task 8. F5 → Tasks 13, 15
  (`RefreshControl`). F6, F7 → Task 8 + Tasks 13, 15. F8 → Task 15. F9 → Task 8 + Tasks 13, 15.
- A1 → Task 6 (clear on sign-out, owner id check). B1 → Task 16. M1 → Task 5. M2 → Tasks 8, 9, 11, 13.
- Edge cases: cold API → Task 6 (no timeout, cache/skeleton); renewal mid-screen → Phase 1 client,
  state lives in screen components so it survives; empty month / income-only → Task 3 KPIs + Task 15
  texts; duplicate `/me` → Task 6 single-flight; search + filters → Task 15 (`filterBills` on the
  active set, distinct empty texts).
- Success criteria → Task 17 manual checks + unit tests in Tasks 2–7, 9, 11, 12, 14.

**Placeholder scan:** Tasks 13 (KpiCards/Sections) and 14 (MonthStepper/FiltersSheet/FilterChips)
specify components by exact props, texts and behaviour rather than full JSX; every string, prop and
rule is stated, so there is nothing left to decide — but they are the least literal steps and the
executor should match the referenced patterns in `BillRow`/`BillDetailsSheet` (Task 10). No "TBD".

**Type/contract consistency:** `ColorToken` (Task 4) is what Task 3's colour helpers return and what
Task 10 indexes `colors[...]` with; Task 4 adds every token Task 3 returns (`accentBg`, `cat*`).
Task 7 hooks call exactly Task 2's endpoint signatures. Task 13 consumes Task 12's function names and
the props listed in Task 13 itself; Task 15 consumes Task 14's component props as declared in Task 14.
`useBills` returns `{ ...query, groups }` and both Task 13 and Task 16 read `groups`/`data` accordingly.
`firstName(profile)` exists in `src/auth/session.ts` (Phase 1).

**Task sizing:** Task 6 touches 4 files across query/app/auth because the owner guard needs the query
client and the provider must wrap auth — splitting would leave a half-wired cache. Task 10 creates 4
small leaf components that are always used together. Task 15 is the largest screen but a single file
plus its KPI component. Task 14 groups four Contas-only controls with one test. Tasks 13 and 15 share
no files, so they can run in parallel.
