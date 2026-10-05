# Plan: Quick Bill Actions — Pay, Undo, Delete (Phase 3a)

**Execution mode:** subagent-driven (default).
**Spec:** `.sdd/specs/2026-10-05-quick-bill-actions.md`
**Web reference:** `../financial-consultant-web/hooks/{use-pay-bill,use-delete-bill,use-delete-installment-series}.ts`,
`components/bills/use-bill-actions.tsx`, `app/api/v1/transactions/route.ts`.

## Design decisions made here (spec left them to implementation)

- **Routes and payloads (from the BFF code):**
  - pay / undo → `PATCH /api/v1/transactions` body `{ month, description, matchDay, matchAmount, confirmed }`;
  - delete one → `DELETE /api/v1/transactions` body `{ month, description, matchDay, matchAmount }`;
  - delete series → `DELETE /api/v1/installments/{installment_id}`.
  `matchAmount` is the **signed** ledger amount, `matchDay` the bill day (spec Q15).
- **Error classification:** the BFF turns upstream 409/404 into **HTTP 500** with
  `{ error: "API request to … failed: 409 Conflict" }`. The app therefore classifies on the
  error text — `/409|ambiguous/` → ambiguous, `/404|nothing_matched|not found/` → not found —
  plus `SessionExpiredError` → session and `NetworkError` → network, exactly like the web's
  `toPtBrMessage` (which matches on message text). A pure `classifyActionError` makes it testable.
- **Copy:** the web's exact strings where they exist —
  pay: "Não foi possível marcar a conta como paga. Tente novamente.";
  delete: "Não foi possível excluir a conta. Tente novamente.";
  series not found: "Não encontrei esse parcelamento. Ele pode já ter sido apagado.";
  series other: "Não foi possível apagar o parcelamento. Tente novamente.";
  bill not found: "Não encontrei essa conta. Ela pode já ter sido removida.".
  The web has no unpay/receive copy, so: receive → "Não foi possível marcar a conta como recebida.
  Tente novamente."; undo → "Não foi possível desfazer o pagamento. Tente novamente." (resolves the
  spec's open question).
- **Optimistic scope (Q3):** the web only patches `["month-transactions", m]`. Here both that
  infinite cache **and** `["month", m]` (Painel, KPIs, tab badge) are patched optimistically, then
  both are invalidated with `["bills-search"]` on settle. Bills are matched by
  `description + day + amount` (stricter than the web's description + day).
- **Serialising repeat actions (edge case):** each action builds its own mutation via
  `queryClient.getMutationCache().build(client, { ...options, scope: { id: billKey } }).execute(vars)`
  (query-core 5.104), so actions on the same bill run in order and the last one wins, while
  different bills run independently.
- **Offline (Q14):** the action checks `onlineManager.isOnline()` first and shows the offline toast
  instead of mutating.
- **Toast (Q5):** a small global `ToastProvider` (one toast at a time, replaced by the next),
  5 000 ms, optional action button, rendered above the tab bar. No new dependency.
- **Swipe (Q1, Q2, Q6, Q7):** `react-native-gesture-handler`'s `ReanimatedSwipeable` (RNGH 2.32 is
  installed). A full swipe executes when the row's translation passes **60 % of the row width** on
  release (a pure `isFullSwipe(translation, width)` helper). The app root gains
  `GestureHandlerRootView`, which RNGH requires and the app does not have yet.
- **Haptics:** `expo-haptics` — `Success` notification on pay/receive/undo, `Warning` on delete
  confirmation.
- **Delete confirmation:** the native `Alert.alert` with a destructive "Excluir" button; copy built
  by a pure `deleteConfirmCopy` ported from `use-bill-actions.tsx` (schedule = `installment.current`
  / `total` back from the current month; "— incluindo parcelas já pagas" when the schedule started
  on or before the current month; month labels "outubro/2026").
- **Details sheet (Q12):** the sheet route keeps a local copy of the transaction so the status
  re-derives instantly after paying; the route now also receives the bill's `month`.
- **Painel exit animation (Q4):** rows in "Contas a pagar" are wrapped in a Reanimated
  `Animated.View` with `exiting={FadeOut}` and `layout={LinearTransition}` (skipped under Reduce
  Motion).
- **Accessibility (Q16):** each swipeable row exposes `accessibilityActions`
  (`pay`/`unpay` and `delete`) handled by `onAccessibilityAction`.

---

### Task 1 — Dependencies and app root

**Files:** `package.json` (modified), `bun.lock` (modified), `src/app/_layout.tsx` (modified)
**Needs context from:** Task 4 — `ToastProvider` exported from `src/ui/toast/ToastProvider.tsx`

- [ ] Run: `bunx expo install expo-haptics` — expect it added to `dependencies`.
- [ ] In `src/app/_layout.tsx`, wrap the whole tree in `GestureHandlerRootView` and mount the
  toast provider inside the query/auth providers:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ToastProvider } from "../ui/toast/ToastProvider";
// ...
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] Run: `bun run typecheck` — expect exit 0 (needs Task 4's file; defer if not landed).
- [ ] `git commit -m "chore: add haptics, gesture root and toast provider to the app root"`

---

### Task 2 — Pure action logic

**Files:** `src/domain/billActions.ts` (new), `src/domain/__tests__/billActions.test.ts` (new)

- [ ] Create `src/domain/billActions.ts`:

```ts
import type { MonthSummary, MonthTransactionsPage, Transaction } from "../api/types";
import { NetworkError, SessionExpiredError } from "../api/client";
import { addMonths } from "./format";

export type BillAction = "pay" | "receive" | "unpay" | "delete" | "deleteSeries";
export type ActionErrorKind = "ambiguous" | "not_found" | "session" | "network" | "other";

/** Fields that identify a bill to the API (spec Q15). */
export interface BillMatch { month: string; description: string; matchDay: number; matchAmount: number }

export function billMatch(tx: Pick<Transaction, "description" | "day" | "amount">, month: string): BillMatch {
  return { month, description: tx.description, matchDay: tx.day, matchAmount: tx.amount };
}

/** Stable key for serialising actions on one bill. */
export function billKey(tx: Pick<Transaction, "description" | "day" | "amount">, month: string): string {
  return `${month}|${tx.description}|${tx.day}|${tx.amount}`;
}

const same = (a: Transaction, m: BillMatch) =>
  a.description === m.description && a.day === m.matchDay && a.amount === m.matchAmount;

/** Returns a copy of `txs` with the matching bill's `confirmed` set. */
export function withConfirmed(txs: Transaction[], m: BillMatch, confirmed: boolean): Transaction[] {
  return txs.map((tx) => (same(tx, m) ? { ...tx, confirmed } : tx));
}

/** Returns a copy of `txs` without the matching bill. */
export function withoutBill(txs: Transaction[], m: BillMatch): Transaction[] {
  return txs.filter((tx) => !same(tx, m));
}

/** Returns a copy of `txs` without every row of an installment series. */
export function withoutSeries(txs: Transaction[], seriesId: string): Transaction[] {
  return txs.filter((tx) => tx.installment?.id !== seriesId);
}

type Pages = { pages: MonthTransactionsPage[]; pageParams: unknown[] };
export function mapPages(data: Pages | undefined, f: (txs: Transaction[]) => Transaction[]): Pages | undefined {
  return data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: f(p.items) })) } : data;
}
export function mapSummary(data: MonthSummary | undefined, f: (txs: Transaction[]) => Transaction[]): MonthSummary | undefined {
  return data ? { ...data, transactions: f(data.transactions ?? []) } : data;
}

/** Maps any action failure to a kind (the BFF reports upstream 409/404 as 500 with the status in the text). */
export function classifyActionError(error: unknown): ActionErrorKind {
  if (error instanceof SessionExpiredError) return "session";
  if (error instanceof NetworkError) return "network";
  const body = (error as { body?: { error?: string } } | null)?.body;
  const text = `${error instanceof Error ? error.message : String(error)} ${body?.error ?? ""}`;
  if (/409|ambiguous/i.test(text)) return "ambiguous";
  if (/404|nothing_matched|not found/i.test(text)) return "not_found";
  if (/401|unauthorized/i.test(text)) return "session";
  return "other";
}

const OTHER: Record<BillAction, string> = {
  pay: "Não foi possível marcar a conta como paga. Tente novamente.",
  receive: "Não foi possível marcar a conta como recebida. Tente novamente.",
  unpay: "Não foi possível desfazer o pagamento. Tente novamente.",
  delete: "Não foi possível excluir a conta. Tente novamente.",
  deleteSeries: "Não foi possível apagar o parcelamento. Tente novamente.",
};

/** pt-BR message for a failed action (spec Q13), web wording where it exists. */
export function actionErrorMessage(action: BillAction, kind: ActionErrorKind): string {
  switch (kind) {
    case "ambiguous": return "Há mais de uma conta parecida. Ajuste os dados e tente de novo.";
    case "not_found":
      return action === "deleteSeries"
        ? "Não encontrei esse parcelamento. Ele pode já ter sido apagado."
        : "Não encontrei essa conta. Ela pode já ter sido removida.";
    case "session": return "Sua sessão expirou. Entre novamente para continuar.";
    case "network": return OFFLINE_MESSAGE;
    case "other": return OTHER[action];
  }
}

export const OFFLINE_MESSAGE = "Sem conexão. Tente de novo quando estiver online.";

/** "outubro/2026" — the web's shortMonthLabel. */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}/${y}`;
}

/** Delete confirmation copy (spec Q8, Q9), ported from the web's use-bill-actions.tsx. */
export function deleteConfirmCopy(
  tx: Pick<Transaction, "description" | "installment">, month: string, currentMonth: string
): { title: string; message: string; seriesId: string | null } {
  const seriesId = tx.installment?.id ?? null;
  if (seriesId && tx.installment) {
    const count = tx.installment.total;
    const firstMonth = addMonths(month, -(tx.installment.current - 1));
    const lastMonth = addMonths(firstMonth, count - 1);
    const paid = firstMonth <= currentMonth ? " — incluindo parcelas já pagas" : "";
    return {
      title: "Excluir parcelamento?",
      message: `As ${count} ${count === 1 ? "parcela" : "parcelas"} de “${tx.description}”, de ${shortMonthLabel(firstMonth)} a ${shortMonthLabel(lastMonth)}, serão apagadas${paid}. Não dá para desfazer.`,
      seriesId,
    };
  }
  return {
    title: "Excluir conta?",
    message: `A conta “${tx.description}” será removida deste mês. Não dá para desfazer.`,
    seriesId: null,
  };
}

/** Which pay-side action applies to a bill. */
export function paySideAction(tx: Pick<Transaction, "confirmed" | "amount">): "pay" | "receive" | "unpay" {
  if (tx.confirmed) return "unpay";
  return tx.amount > 0 ? "receive" : "pay";
}
```

- [ ] Create `src/domain/__tests__/billActions.test.ts`:

```ts
import { ApiError, NetworkError, SessionExpiredError } from "../../api/client";
import type { Transaction } from "../../api/types";
import {
  actionErrorMessage, billMatch, classifyActionError, deleteConfirmCopy, paySideAction,
  shortMonthLabel, withConfirmed, withoutBill, withoutSeries,
} from "../billActions";

const tx = (p: Partial<Transaction> = {}): Transaction => ({
  transaction_id: "t", user_id: "u", day: 10, category: "Contas", description: "Luz", amount: -100,
  confirmed: false, installment: null, comment: null, group_ids: [], recurring_rule_id: null, skipped: false, ...p,
});

test("Q15: match uses description, day and signed amount", () => {
  expect(billMatch(tx(), "2026-10")).toEqual({ month: "2026-10", description: "Luz", matchDay: 10, matchAmount: -100 });
});

test("Q3: confirm only the exact bill", () => {
  const out = withConfirmed([tx(), tx({ day: 11 }), tx({ amount: -50 })], billMatch(tx(), "2026-10"), true);
  expect(out.map((t) => t.confirmed)).toEqual([true, false, false]);
});

test("Q11: remove only the exact bill; series removal by id", () => {
  expect(withoutBill([tx(), tx({ day: 11 })], billMatch(tx(), "2026-10"))).toHaveLength(1);
  const s = { current: 1, total: 3, id: "s1" };
  expect(withoutSeries([tx({ installment: s }), tx()], "s1")).toHaveLength(1);
});

test("Q13: error classification", () => {
  expect(classifyActionError(new SessionExpiredError())).toBe("session");
  expect(classifyActionError(new NetworkError())).toBe("network");
  expect(classifyActionError(new ApiError("x", 500, { error: "API request to transactions failed: 409 Conflict" }))).toBe("ambiguous");
  expect(classifyActionError(new ApiError("x", 500, { error: "API request to transactions failed: 404 Not Found" }))).toBe("not_found");
  expect(classifyActionError(new ApiError("x", 500, { error: "boom" }))).toBe("other");
});

test("Q13: messages", () => {
  expect(actionErrorMessage("pay", "ambiguous")).toBe("Há mais de uma conta parecida. Ajuste os dados e tente de novo.");
  expect(actionErrorMessage("deleteSeries", "not_found")).toBe("Não encontrei esse parcelamento. Ele pode já ter sido apagado.");
  expect(actionErrorMessage("network" as never, "network")).toBe("Sem conexão. Tente de novo quando estiver online.");
});

test("Q8: single delete copy", () => {
  expect(deleteConfirmCopy(tx(), "2026-10", "2026-10")).toEqual({
    title: "Excluir conta?",
    message: "A conta “Luz” será removida deste mês. Não dá para desfazer.",
    seriesId: null,
  });
});

test("Q9: series delete copy with paid parcels", () => {
  const c = deleteConfirmCopy(tx({ description: "PC", installment: { current: 13, total: 18, id: "s" } }), "2026-10", "2026-10");
  expect(c.title).toBe("Excluir parcelamento?");
  expect(c.message).toBe(
    `As 18 parcelas de “PC”, de ${shortMonthLabel("2025-10")} a ${shortMonthLabel("2027-03")}, serão apagadas — incluindo parcelas já pagas. Não dá para desfazer.`
  );
  expect(c.seriesId).toBe("s");
});

test("legacy installment without id uses single copy", () => {
  expect(deleteConfirmCopy(tx({ installment: { current: 1, total: 2 } }), "2026-10", "2026-10").title).toBe("Excluir conta?");
});

test("pay side action", () => {
  expect(paySideAction(tx())).toBe("pay");
  expect(paySideAction(tx({ amount: 10 }))).toBe("receive");
  expect(paySideAction(tx({ confirmed: true }))).toBe("unpay");
});
```

- [ ] Run: `bun run test src/domain/__tests__/billActions.test.ts && bun run typecheck` — expect pass.
- [ ] `git commit -m "feat(domain): add pure helpers for pay, undo and delete actions"`

---

### Task 3 — Write endpoints

**Files:** `src/api/endpoints.ts` (modified), `src/api/__tests__/endpoints.test.ts` (modified)
**Needs context from:** Task 2 — `BillMatch` shape

- [ ] Append to `src/api/endpoints.ts`:

```ts
import type { BillMatch } from "../domain/billActions";

/** PATCH /transactions — confirm or unconfirm one bill. */
export function setTransactionConfirmed(match: BillMatch, confirmed: boolean): Promise<unknown> {
  return apiFetch("transactions", { method: "PATCH", body: JSON.stringify({ ...match, confirmed }) });
}

/** DELETE /transactions — delete one bill (recurring occurrences become skipped server-side). */
export function deleteTransaction(match: BillMatch): Promise<unknown> {
  return apiFetch("transactions", { method: "DELETE", body: JSON.stringify(match) });
}

/** DELETE /installments/{id} — delete a whole installment series. */
export function deleteInstallmentSeries(seriesId: string): Promise<unknown> {
  return apiFetch(`installments/${encodeURIComponent(seriesId)}`, { method: "DELETE" });
}
```

  (Merge the import with the existing imports at the top.)
- [ ] Extend `src/api/__tests__/endpoints.test.ts`:

```ts
import { deleteInstallmentSeries, deleteTransaction, setTransactionConfirmed } from "../endpoints";

test("write routes and bodies", async () => {
  const m = { month: "2026-10", description: "Luz", matchDay: 10, matchAmount: -100 };
  await setTransactionConfirmed(m, true);
  await deleteTransaction(m);
  await deleteInstallmentSeries("s 1");
  const c = (apiFetch as jest.Mock).mock.calls;
  expect(c[0]).toEqual(["transactions", { method: "PATCH", body: JSON.stringify({ ...m, confirmed: true }) }]);
  expect(c[1]).toEqual(["transactions", { method: "DELETE", body: JSON.stringify(m) }]);
  expect(c[2]).toEqual(["installments/s%201", { method: "DELETE" }]);
});
```

  (Merge the import into the existing one; `beforeEach` already clears the mock.)
- [ ] Run: `bun run test src/api && bun run typecheck` — expect pass.
- [ ] `git commit -m "feat(api): add pay, undo and delete endpoints"`

---

### Task 4 — Global toast

**Files:** `src/ui/toast/ToastProvider.tsx` (new), `src/ui/toast/__tests__/toastQueue.test.ts` (new), `src/ui/toast/toastQueue.ts` (new)

- [ ] Create `src/ui/toast/toastQueue.ts`:

```ts
export const TOAST_DURATION_MS = 5000; // spec Q5

export interface ToastSpec { message: string; actionLabel?: string; onAction?: () => void; tone?: "neutral" | "error" }
export interface ToastState extends ToastSpec { id: number }

/** The next toast replaces the current one (spec Q5). */
export function nextToast(_current: ToastState | null, spec: ToastSpec, id: number): ToastState {
  return { ...spec, id };
}
```

- [ ] Create `src/ui/toast/__tests__/toastQueue.test.ts`:

```ts
import { nextToast, TOAST_DURATION_MS } from "../toastQueue";

test("Q5: a new toast replaces the current one and lasts 5 s", () => {
  const a = nextToast(null, { message: "A" }, 1);
  const b = nextToast(a, { message: "B" }, 2);
  expect(b).toEqual({ message: "B", id: 2 });
  expect(TOAST_DURATION_MS).toBe(5000);
});
```

- [ ] Create `src/ui/toast/ToastProvider.tsx`:

```tsx
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { nextToast, TOAST_DURATION_MS, type ToastSpec, type ToastState } from "./toastQueue";

const ToastContext = createContext<((spec: ToastSpec) => void) | null>(null);
/** Space reserved above the floating tab bar. */
const TAB_BAR_CLEARANCE = 72;

export function ToastProvider({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [toast, setToast] = useState<ToastState | null>(null);
  const seq = useRef(0);

  const show = useCallback((spec: ToastSpec) => {
    seq.current += 1;
    const id = seq.current;
    setToast((cur) => nextToast(cur, spec, id));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const value = useMemo(() => show, [show]);
  const bg = toast?.tone === "error" ? colors.danger : colors.ink;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={reduced ? undefined : FadeInDown.duration(200)}
          exiting={reduced ? undefined : FadeOutDown.duration(200)}
          pointerEvents="box-none"
          style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + TAB_BAR_CLEARANCE }}
        >
          <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: bg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ flex: 1, color: colors.panel, fontSize: 15 }}>{toast.message}</Text>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                onPress={() => { toast.onAction?.(); setToast(null); }}
                hitSlop={8}
              >
                <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 15 }}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (spec: ToastSpec) => void {
  const v = use(ToastContext);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}
```

- [ ] Run: `bun run test src/ui/toast && bun run typecheck && bun run lint` — expect pass, 0 lint errors.
- [ ] `git commit -m "feat(ui): add a global toast with an optional action"`

---

### Task 5 — Bill mutations (optimistic, serialised, haptics, toasts)

**Files:** `src/hooks/billMutations.ts` (new)
**Needs context from:** Task 2 — `billMatch`, `billKey`, `withConfirmed`, `withoutBill`, `withoutSeries`, `mapPages`, `mapSummary`, `classifyActionError`, `actionErrorMessage`, `OFFLINE_MESSAGE`, `paySideAction`; Task 3 — `setTransactionConfirmed`, `deleteTransaction`, `deleteInstallmentSeries`; Task 4 — `useToast()`

- [ ] Create `src/hooks/billMutations.ts`. Each action builds its own mutation in the mutation
  cache with `scope: { id: billKey(tx, month) }`, so TanStack runs actions on the **same** bill in
  order (the last one wins) while different bills stay independent. `MutationCache.build(client,
  options).execute(variables)` is the query-core 5.104 API for that (it is what `useMutation` calls
  internally); the result promise is caught because errors are handled in `onError`.

```ts
import { onlineManager, useQueryClient, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { deleteInstallmentSeries, deleteTransaction, setTransactionConfirmed } from "../api/endpoints";
import type { MonthSummary, Transaction } from "../api/types";
import {
  actionErrorMessage, billKey, billMatch, classifyActionError, mapPages, mapSummary, OFFLINE_MESSAGE,
  paySideAction, withConfirmed, withoutBill, withoutSeries, type BillAction,
} from "../domain/billActions";
import { useToast } from "../ui/toast/ToastProvider";

type Pages = Parameters<typeof mapPages>[0];
type Snapshot = { pages: Pages; summary: MonthSummary | undefined };

async function snapshotAndPatch(qc: QueryClient, month: string, f: (txs: Transaction[]) => Transaction[]): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: ["month-transactions", month] });
  await qc.cancelQueries({ queryKey: ["month", month] });
  const pages = qc.getQueryData<Pages>(["month-transactions", month]);
  const summary = qc.getQueryData<MonthSummary>(["month", month]);
  qc.setQueryData(["month-transactions", month], mapPages(pages, f));
  qc.setQueryData(["month", month], mapSummary(summary, f));
  return { pages, summary };
}

function restore(qc: QueryClient, month: string, snap: Snapshot | undefined) {
  if (!snap) return;
  qc.setQueryData(["month-transactions", month], snap.pages);
  qc.setQueryData(["month", month], snap.summary);
}

function settle(qc: QueryClient, month: string) {
  void qc.invalidateQueries({ queryKey: ["month-transactions", month] });
  void qc.invalidateQueries({ queryKey: ["month", month] });
  void qc.invalidateQueries({ queryKey: ["bills-search"] });
}

/** Runs one mutation serialised per bill (spec edge case "rapid repeat actions"). */
function runScoped<V>(qc: QueryClient, scopeId: string, options: MutationOptions<unknown, unknown, V, Snapshot>, vars: V) {
  qc.getMutationCache().build(qc, { ...options, scope: { id: scopeId } }).execute(vars).catch(() => {
    // Handled in options.onError (rollback + toast).
  });
}

interface ConfirmVars { tx: Transaction; month: string; confirmed: boolean; action: BillAction }
interface DeleteVars { tx: Transaction; month: string; seriesId: string | null }

/** Pay / receive / undo with optimistic updates, rollback and the Desfazer toast (spec Q1–Q6, Q13, Q14). */
export function useSetBillConfirmed(): (tx: Transaction, month: string) => void {
  const qc = useQueryClient();
  const toast = useToast();

  return useCallback(
    (tx: Transaction, month: string) => {
      if (!onlineManager.isOnline()) {
        toast({ message: OFFLINE_MESSAGE, tone: "error" });
        return;
      }
      const options: MutationOptions<unknown, unknown, ConfirmVars, Snapshot> = {
        mutationFn: (v) => setTransactionConfirmed(billMatch(v.tx, v.month), v.confirmed),
        onMutate: (v) => snapshotAndPatch(qc, v.month, (txs) => withConfirmed(txs, billMatch(v.tx, v.month), v.confirmed)),
        onError: (err, v, snap) => {
          restore(qc, v.month, snap);
          toast({ message: actionErrorMessage(v.action, classifyActionError(err)), tone: "error" });
        },
        onSettled: (_d, _e, v) => settle(qc, v.month),
      };
      const key = billKey(tx, month);
      const action = paySideAction(tx);
      const confirmed = action !== "unpay";
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      runScoped(qc, key, options, { tx, month, confirmed, action });
      if (confirmed) {
        toast({
          message: action === "receive" ? "Conta recebida" : "Conta paga",
          actionLabel: "Desfazer",
          onAction: () => runScoped(qc, key, options, { tx: { ...tx, confirmed: true }, month, confirmed: false, action: "unpay" }),
        });
      }
    },
    [qc, toast]
  );
}

/** Delete one bill or a whole installment series (spec Q7–Q11, Q13, Q14). Confirmation happens in the caller. */
export function useDeleteBill(): (tx: Transaction, month: string, seriesId: string | null) => void {
  const qc = useQueryClient();
  const toast = useToast();

  return useCallback(
    (tx: Transaction, month: string, seriesId: string | null) => {
      if (!onlineManager.isOnline()) {
        toast({ message: OFFLINE_MESSAGE, tone: "error" });
        return;
      }
      const options: MutationOptions<unknown, unknown, DeleteVars, Snapshot> = {
        mutationFn: (v) => (v.seriesId ? deleteInstallmentSeries(v.seriesId) : deleteTransaction(billMatch(v.tx, v.month))),
        onMutate: (v) =>
          snapshotAndPatch(qc, v.month, (txs) => (v.seriesId ? withoutSeries(txs, v.seriesId) : withoutBill(txs, billMatch(v.tx, v.month)))),
        onError: (err, v, snap) => {
          restore(qc, v.month, snap);
          toast({ message: actionErrorMessage(v.seriesId ? "deleteSeries" : "delete", classifyActionError(err)), tone: "error" });
        },
        onSettled: (_d, _e, v) => {
          settle(qc, v.month);
          if (v.seriesId) void qc.invalidateQueries({ queryKey: ["month"] }); // a series spans months
        },
      };
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      runScoped(qc, billKey(tx, month), options, { tx, month, seriesId });
    },
    [qc, toast]
  );
}
```

  If the installed types require the 4th generic of `MutationOptions` to be named differently
  (`TOnMutateResult` in 5.104), keep the same order `<TData, TError, TVariables, TOnMutateResult>`.
- [ ] Run: `bun run typecheck && bun run lint` — expect pass (depends on Tasks 2–4).
- [ ] `git commit -m "feat(hooks): add optimistic pay, undo and delete mutations"`

---

### Task 6 — Swipeable bill row

**Files:** `src/ui/bills/SwipeableBillRow.tsx` (new), `src/ui/bills/swipe.ts` (new), `src/ui/bills/__tests__/swipe.test.ts` (new)
**Needs context from:** Task 5 — `useSetBillConfirmed()` → `(tx, month) => void`, `useDeleteBill()` → `(tx, month, seriesId) => void`; Task 2 — `deleteConfirmCopy`, `paySideAction`

- [ ] Create `src/ui/bills/swipe.ts`:

```ts
export const FULL_SWIPE_RATIO = 0.6;
/** True when a release past 60 % of the row width should execute the action (spec Q2). */
export function isFullSwipe(translationX: number, rowWidth: number): boolean {
  return rowWidth > 0 && Math.abs(translationX) >= rowWidth * FULL_SWIPE_RATIO;
}

export const PAY_LABELS = { pay: "Pagar", receive: "Receber", unpay: "Desfazer pagamento" } as const;
```

- [ ] Create `src/ui/bills/__tests__/swipe.test.ts`:

```ts
import { isFullSwipe, PAY_LABELS } from "../swipe";

test("Q2: full swipe threshold at 60 % of the width", () => {
  expect(isFullSwipe(240, 400)).toBe(true);
  expect(isFullSwipe(-240, 400)).toBe(true);
  expect(isFullSwipe(239, 400)).toBe(false);
  expect(isFullSwipe(500, 0)).toBe(false);
});

test("Q1/Q6: labels", () => {
  expect(PAY_LABELS).toEqual({ pay: "Pagar", receive: "Receber", unpay: "Desfazer pagamento" });
});
```

- [ ] Create `src/ui/bills/SwipeableBillRow.tsx`:

```tsx
import { useRef, useState, type ComponentProps } from "react";
import { Alert, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { runOnJS, useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { currentMonth } from "../../domain/bills";
import { deleteConfirmCopy, paySideAction } from "../../domain/billActions";
import { useDeleteBill, useSetBillConfirmed } from "../../hooks/billMutations";
import { useTheme } from "../../theme/ThemeProvider";
import { BillRow } from "./BillRow";
import { isFullSwipe, PAY_LABELS } from "./swipe";

type Props = ComponentProps<typeof BillRow> & { month: string };

/** Mirrors the swipe translation into a JS ref so the release can decide on a full swipe. */
function TrackTranslation({ translation, onChange }: { translation: SharedValue<number>; onChange: (x: number) => void }) {
  useAnimatedReaction(() => translation.value, (x) => runOnJS(onChange)(x));
  return null;
}

/** A bill row with Mail-style swipe actions (spec Q1, Q2, Q6, Q7, Q16). */
export function SwipeableBillRow({ month, ...rowProps }: Props) {
  const { colors } = useTheme();
  const { bill } = rowProps;
  const setConfirmed = useSetBillConfirmed();
  const deleteBill = useDeleteBill();
  const ref = useRef<SwipeableMethods>(null);
  const lastX = useRef(0);
  const [width, setWidth] = useState(0);
  const side = paySideAction(bill);

  const pay = () => { ref.current?.close(); setConfirmed(bill, month); };
  const askDelete = () => {
    ref.current?.close();
    const copy = deleteConfirmCopy(bill, month, currentMonth());
    Alert.alert(copy.title, copy.message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deleteBill(bill, month, copy.seriesId) },
    ]);
  };

  const payBg = side === "unpay" ? colors.inkSoft : colors.ok;
  const action = (label: string, bg: string, onPress: () => void, align: "flex-start" | "flex-end") => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ flex: 1, backgroundColor: bg, justifyContent: "center", alignItems: align, paddingHorizontal: 20 }}>
      <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityActions={[{ name: "pay", label: PAY_LABELS[side] }, { name: "delete", label: "Excluir" }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === "pay" ? pay() : askDelete())}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1.5}
        overshootLeft
        overshootRight
        leftThreshold={80}
        rightThreshold={80}
        renderLeftActions={(_p, translation) => (
          <View style={{ width: width || 400, flexDirection: "row" }}>
            <TrackTranslation translation={translation} onChange={(x) => { lastX.current = x; }} />
            {action(PAY_LABELS[side], payBg, pay, "flex-start")}
          </View>
        )}
        renderRightActions={(_p, translation) => (
          <View style={{ width: width || 400, flexDirection: "row" }}>
            <TrackTranslation translation={translation} onChange={(x) => { lastX.current = x; }} />
            {action("Excluir", colors.danger, askDelete, "flex-end")}
          </View>
        )}
        onSwipeableWillOpen={(direction) => {
          if (!isFullSwipe(lastX.current, width)) return;
          if (direction === "left") pay(); else askDelete();
        }}
      >
        <View style={{ backgroundColor: colors.panel }}>
          <BillRow {...rowProps} />
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}
```

  The executor must verify against the installed RNGH 2.32 types: the `direction` value passed to
  `onSwipeableWillOpen` (`"left"`/`"right"` or the `SwipeDirection` enum), which side
  `renderLeftActions` maps to (left actions appear when swiping **right**), and that action panels
  sized to the row width with `overshoot*` allow a full-width drag. Adjust the code to the real
  API, keeping the behaviour: swipe right → pay side, swipe left → delete, ≥ 60 % on release →
  execute.
- [ ] Run: `bun run test src/ui/bills && bun run typecheck && bun run lint` — expect pass.
- [ ] `git commit -m "feat(ui): add a swipeable bill row with pay and delete actions"`

---

### Task 7 — Details sheet footer

**Files:** `src/ui/bills/BillDetailsSheet.tsx` (modified), `src/app/bill-details.tsx` (modified)
**Needs context from:** Task 5 — `useSetBillConfirmed()`, `useDeleteBill()`; Task 2 — `deleteConfirmCopy`, `paySideAction`; Task 6 — `PAY_LABELS` from `src/ui/bills/swipe.ts`

- [ ] In `BillDetailsSheet.tsx`, change `useOpenBillDetails()` to return
  `(bill: BillViewModel, month: string) => void` and push `params: { bill: JSON.stringify(bill), month }`.
- [ ] Add to `BillDetailsContent` props `month: string` and a footer below the existing content:
  a primary `Button` labelled `PAY_LABELS[paySideAction(bill)]` (variant `"primary"` for
  pay/receive, `"secondary"` for "Desfazer pagamento") calling `setConfirmed(bill, month)`, and a
  `"danger"` `Button` "Excluir" that shows the same `Alert.alert` confirmation as Task 6 and, on
  confirm, calls `deleteBill(bill, month, seriesId)` **then** `onClose()` (spec Q12).
- [ ] In `src/app/bill-details.tsx`, read `month` from params, keep the transaction in local state
  initialised from the param, and re-derive the view model after a pay/undo so the status sentence
  and footer update while the sheet stays open:

```tsx
const [tx, setTx] = useState<Transaction | null>(parsedBill);
const bill = useMemo(() => (tx && month ? toBillViewModels([tx], month, new Date())[0] ?? null : null), [tx, month]);
// pass onConfirmedChange={(confirmed) => setTx((t) => (t ? { ...t, confirmed } : t))} to BillDetailsContent
```

  `BillDetailsContent` calls `onConfirmedChange(!bill.confirmed)` right after `setConfirmed(...)`.
  The Desfazer from the toast updates the lists; the open sheet reflects the toast undo only after
  it is reopened (acceptable: the toast and the sheet are not shown together in practice).
- [ ] Run: `bun run typecheck && bun run lint` — expect pass (callers are updated in Task 8; a
  type error at the two `openBill` call sites is expected until then — defer).
- [ ] `git commit -m "feat(ui): add pay, undo and delete to the bill details sheet"`

---

### Task 8 — Wire swipe rows into Painel and Contas

**Files:** `src/features/painel/Sections.tsx` (modified), `src/app/(tabs)/painel.tsx` (modified), `src/app/(tabs)/contas.tsx` (modified)
**Needs context from:** Task 6 — `SwipeableBillRow` props = `BillRow` props + `month`; Task 7 — `useOpenBillDetails()` returns `(bill, month) => void`

- [ ] `Sections.tsx` → `UnpaidSection` gains a `month: string` prop and renders each row as:

```tsx
<Animated.View key={b.selectionKey} exiting={reduced ? undefined : FadeOut.duration(200)} layout={reduced ? undefined : LinearTransition}>
  <SwipeableBillRow month={month} bill={b} groups={allGroups} showPill={false} onPress={() => onSelect(b)} />
</Animated.View>
```

  (`Animated`, `FadeOut`, `LinearTransition`, `useReducedMotion` from `react-native-reanimated`.)
- [ ] `painel.tsx`: pass `month={month}` to `UnpaidSection` and change `onSelect` to
  `(b) => openBill(b, month)`.
- [ ] `contas.tsx`: replace `BillRow` in `renderItem` with `SwipeableBillRow` (same props plus
  `month={month}`) and call `openBill(item, month)`.
- [ ] Run: `bun run typecheck && bun run lint && bun run test` — all pass.
- [ ] `git commit -m "feat: enable swipe actions on painel and contas rows"`

---

### Task 9 — Docs and manual verification

**Files:** `docs/04-phased-plan.md` (modified)

- [ ] Mark the Phase 3 bullets for pay/un-pay and delete as delivered in 3a (date), noting the
  swipe pattern and the undo toast.
- [ ] Run: `bun run typecheck && bun run lint && bun run test` — all pass.
- [ ] Rebuild and run on the Simulator with the local BFF, then check:
  - swipe right on an unpaid bill → "Pagar"/"Receber"; tap → paid, haptic, toast "Conta paga" with
    Desfazer; Desfazer within 5 s → back to pending; after 5 s the toast is gone;
  - full swipe right → paid without tap; on a paid bill → "Desfazer pagamento" (no toast);
  - Painel "Contas a pagar": paying removes the row with an animation; KPIs and the Contas badge
    update immediately;
  - swipe left → "Excluir" → "Excluir conta?" copy; Cancelar keeps it; Excluir removes it;
  - installment bill → "Excluir parcelamento?" with the month range and the paid-parcels suffix;
  - details sheet footer: pay keeps the sheet open with the new status; Excluir confirms and
    closes;
  - stop the BFF → any action shows "Sem conexão. Tente de novo quando estiver online." and
    nothing changes;
  - force an error (BFF up, `MOBILE_OAUTH_CLIENT_IDS` unchanged, temporarily rename a bill on the
    web between loading and paying) → rollback + "Não encontrei essa conta…";
  - VoiceOver: the row exposes "Pagar"/"Excluir" actions;
  - the web shows the same final state for each bill touched.
- [ ] `git commit -m "docs: mark phase 3a quick actions delivered"`

---

## Self-review

**Spec coverage:**
- Q1, Q2, Q6, Q7 → Task 6 (swipe sides, labels, full swipe at 60 %), Task 2 (`paySideAction`).
- Q3 → Task 5 (optimistic patch of both month caches + invalidation), Task 8 (all lists use it).
- Q4 → Task 8 (exit animation in Painel's list).
- Q5 → Task 4 (toast, 5 s, replace) + Task 5 (toast with Desfazer on pay/receive only).
- Q8, Q9 → Task 2 (`deleteConfirmCopy`, tests with the web's wording) + Tasks 6/7 (Alert).
- Q10 → server behaviour; Task 3 sends a plain delete for recurring occurrences.
- Q11 → Task 5 (optimistic removal, Warning haptic) + Task 6 (Cancelar closes the swipe).
- Q12 → Task 7. Q13 → Task 2 (classification + copy) + Task 5 (rollback + error toast).
- Q14 → Task 5 (`onlineManager` guard). Q15 → Task 2 (`billMatch`) + Task 3 (bodies).
- Q16 → Task 6 (`accessibilityActions`) + Task 7 (footer).
- Edge cases: projected occurrences → same PATCH/DELETE (server materializes); legacy series →
  Task 2 test; rapid repeat → Task 5 per-bill scope; undo after leaving → global toast (Task 4);
  filtered-out after paying → optimistic patch re-filters; search rows → `bills-search`
  invalidation (Task 5).

**Placeholder scan:** Task 5's per-bill serialisation is now concrete (`MutationCache.build(...).execute`,
verified in query-core 5.104). Task 6 asks the executor to confirm RNGH 2.32's exact
`onSwipeableWillOpen` direction values and left/right mapping against the installed types, with the
required behaviour stated — a version check, not open design. No "TBD".

**Type/contract consistency:** Task 3 imports `BillMatch` from Task 2. Task 5 uses exactly Task 2's
exports and Task 3's three endpoint names, and Task 4's `useToast()`. Task 6 calls Task 5's
`(tx, month)` / `(tx, month, seriesId)` callbacks; `BillViewModel` extends `Transaction`, so rows
pass straight through. Task 7 changes `useOpenBillDetails` to `(bill, month)`; Task 8 updates both
call sites. Task 1 mounts Task 4's `ToastProvider` inside `AuthProvider`, above every screen.

**Task sizing:** Task 5 is one file but the core logic; kept whole because pay and delete share the
snapshot/restore helpers. Task 8 touches three screen files for the same wiring change. No task
exceeds ~3 files except Task 4 (3 small files of one feature).
