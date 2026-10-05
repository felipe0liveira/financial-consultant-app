# Plan: Painel — "Mês quitado" Card

**Execution mode:** subagent-driven, with one fresh agent per task and a review between tasks.
Task 4 (Simulator check against the production account) runs **inline**.
**Spec:** `.sdd/specs/2026-10-05-painel-mes-quitado.md`

## Design decisions made here (spec left them to implementation)

- **The pure derivation lives in a new `src/features/painel/settled.ts` module**, beside the
  existing `derive.ts`. It follows the repo split: pure logic is unit-tested, components stay thin.
  The month's sums reuse `deriveContasKpis` (in `src/domain/bills.ts`), so "Sobrou/Faltou" uses
  exactly the same **Recebido** and **Pago** figures Contas shows, with skipped rows excluded.
- **"Settled" is decided per transaction, not from the KPI totals.** The current month is
  settled when it has at least one non-skipped expense (`amount < 0`) and every one of them is
  `confirmed`.
  - An unconfirmed **virtual** (projected) expense therefore keeps the month unsettled, matching
    "every expense is paid".
  - Income is ignored for the rule (spec 1).
- **Paid count** (spec 5) counts paid expenses only, which is the confirmed `amount < 0` rows.
- **The next month's data is read through `useMonth(addMonths(month, 1))`**, the same
  `["month", m]` query and cache everything else uses.
  - Bill mutations already invalidate every `["month"]` query, so after a Nova conta or a payment
    the preview refreshes on its own.
  - Painel's focus refetch and pull-to-refresh are extended to include the next month.
  - The query runs only while the month is settled (`enabled`), so the normal Painel does no
    extra request.
- **"{quando}"** (spec 8) reuses `billStatusLabel` ("Em 27 dias", "Em 1 dia") with the first
  letter lowercased. That is the wording the bill pills already show. A next-month bill can only
  be `this-week` or `upcoming`, so no other label can appear.
- **The earliest-due bill** is the next month's first unpaid expense by day.
  `toBillViewModels` already sorts by day, so this is the first unconfirmed `amount < 0` row.
- **Month names:** a small `monthName(month)` helper returns the capitalized pt-BR month alone
  ("Outubro"). `formatMonthLong` already exists but includes the year, and the card needs the
  name only.
- **Switching** (spec 3) needs nothing extra. Painel recomputes on every render from `bills.data`,
  which the 3a optimistic patches and invalidations already update. The card replaces
  `<KpiCards>` in the same slot, with the same `FadeInUp` entrance.
- **Preview tap** reuses Painel's existing navigation to Contas:
  `router.push({ pathname: "/contas", params: { month } })`, the same as "Ver detalhes". Contas
  already consumes the `month` param.

---

### Task 1 — Settled-month derivation

**Files:** `src/features/painel/settled.ts` (new), `src/features/painel/__tests__/settled.test.ts` (new)

- [ ] Create `src/features/painel/settled.ts`:

```ts
import type { Transaction } from "../../api/types";
import { billStatusLabel, deriveContasKpis, toBillViewModels } from "../../domain/bills";
import { addMonths } from "../../domain/format";

/** The "mês quitado" figures (spec 5–7). */
export interface SettledSummary {
  /** Total paid in expenses (positive). */
  paidAmount: number;
  /** Number of paid expenses. */
  paidCount: number;
  /** Received minus paid; negative when paid exceeds received. */
  result: number;
  /** Income not yet received (positive); 0 when none. */
  pendingIncome: number;
}

/**
 * Null unless the month has at least one expense and every expense is confirmed (spec 1–3).
 * Pending income does not block the settled state.
 */
export function deriveSettled(transactions: Transaction[], month: string, today: Date): SettledSummary | null {
  const expenses = transactions.filter((t) => !t.skipped && t.amount < 0);
  if (expenses.length === 0 || expenses.some((t) => !t.confirmed)) return null;
  const k = deriveContasKpis(transactions, month, today);
  return { paidAmount: k.pago, paidCount: expenses.length, result: k.recebido - k.pago, pendingIncome: k.aReceber };
}

/** "Outubro" — capitalized pt-BR month name of a YYYY-MM key. */
export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The month after `month` (December → January of the next year). */
export function nextMonthOf(month: string): string {
  return addMonths(month, 1);
}

/** Spec 6: "Sobrou no mês" for ≥ 0, "Faltou no mês" (positive amount, alert) for < 0. */
export function monthResultLine(result: number): { label: string; amount: number; negative: boolean } {
  return result < 0
    ? { label: "Faltou no mês", amount: Math.abs(result), negative: true }
    : { label: "Sobrou no mês", amount: result, negative: false };
}

export interface NextMonthPreview {
  month: string;
  /** Total of the month's unpaid expenses (positive). */
  toPay: number;
  /** Earliest-due unpaid expense, or null when nothing is left to pay. */
  next: { description: string; when: string } | null;
}

/** Spec 8: what the next month still has to pay, and which bill comes first. */
export function deriveNextMonthPreview(transactions: Transaction[], month: string, today: Date): NextMonthPreview {
  const unpaid = toBillViewModels(transactions, month, today).filter((b) => b.amount < 0 && !b.confirmed);
  const toPay = unpaid.reduce((s, b) => s + Math.abs(b.amount), 0);
  const first = unpaid[0];
  const label = first ? billStatusLabel(first) : "";
  return {
    month,
    toPay,
    next: first ? { description: first.description, when: label.charAt(0).toLowerCase() + label.slice(1) } : null,
  };
}
```

- [ ] Create `src/features/painel/__tests__/settled.test.ts`:

```ts
import type { Transaction } from "../../../api/types";
import { deriveNextMonthPreview, deriveSettled, monthName, monthResultLine, nextMonthOf } from "../settled";

const today = new Date(2026, 9, 5);
const tx = (p: Partial<Transaction>): Transaction => ({
  transaction_id: "t", user_id: "u", day: 10, category: "Contas", description: "x", amount: -100,
  confirmed: false, installment: null, comment: null, group_ids: [], recurring_rule_id: null, skipped: false, ...p,
});

describe("deriveSettled", () => {
  test("all expenses paid → settled, with paid total, count and result", () => {
    const s = deriveSettled([tx({ amount: -100, confirmed: true }), tx({ amount: -50, confirmed: true }), tx({ amount: 400, confirmed: true })], "2026-10", today);
    expect(s).toEqual({ paidAmount: 150, paidCount: 2, result: 250, pendingIncome: 0 });
  });
  test("one unpaid expense → not settled", () => {
    expect(deriveSettled([tx({ confirmed: true }), tx({ confirmed: false })], "2026-10", today)).toBeNull();
  });
  test("unpaid virtual (projected) expense → not settled", () => {
    expect(deriveSettled([tx({ confirmed: true }), tx({ transaction_id: null, day: 1 })], "2026-10", today)).toBeNull();
  });
  test("no expenses → not settled", () => {
    expect(deriveSettled([tx({ amount: 500, confirmed: true })], "2026-10", today)).toBeNull();
    expect(deriveSettled([], "2026-10", today)).toBeNull();
  });
  test("pending income does not block, and is reported", () => {
    const s = deriveSettled([tx({ amount: -100, confirmed: true }), tx({ amount: 300, confirmed: false })], "2026-10", today);
    expect(s).toMatchObject({ pendingIncome: 300, result: -100 });
  });
  test("skipped rows are ignored", () => {
    expect(deriveSettled([tx({ confirmed: true }), tx({ confirmed: false, skipped: true })], "2026-10", today)).toMatchObject({ paidCount: 1 });
  });
});

test("Sobrou / Faltou", () => {
  expect(monthResultLine(250)).toEqual({ label: "Sobrou no mês", amount: 250, negative: false });
  expect(monthResultLine(0)).toEqual({ label: "Sobrou no mês", amount: 0, negative: false });
  expect(monthResultLine(-300)).toEqual({ label: "Faltou no mês", amount: 300, negative: true });
});

test("month names and December rollover", () => {
  expect(monthName("2026-10")).toBe("Outubro");
  expect(nextMonthOf("2026-10")).toBe("2026-11");
  expect(nextMonthOf("2026-12")).toBe("2027-01");
});

describe("deriveNextMonthPreview", () => {
  test("total to pay and earliest unpaid expense", () => {
    const p = deriveNextMonthPreview(
      [tx({ day: 15, description: "Luz", amount: -80 }), tx({ day: 1, description: "Cartão", amount: -900 }), tx({ day: 2, amount: -20, confirmed: true }), tx({ day: 1, amount: 5000 })],
      "2026-11", today
    );
    expect(p.toPay).toBe(980);
    expect(p.next).toEqual({ description: "Cartão", when: "em 27 dias" });
  });
  test("nothing left to pay", () => {
    expect(deriveNextMonthPreview([tx({ confirmed: true })], "2026-11", today)).toEqual({ month: "2026-11", toPay: 0, next: null });
  });
});
```

- [ ] Run: `bun run test -- src/features/painel/__tests__/settled.test.ts`. Expected: all pass.
  If the suite fails only because `src/config/env.ts` throws on import (through `domain/bills` →
  `api/client`), add the same first line used in `src/domain/__tests__/newBill.test.ts`:
  `jest.mock("../../../config/env", () => ({ env: { bffUrl: "http://bff" } }));`.
- [ ] Run: `bun run typecheck`. Expected: no errors.
- [ ] Commit: `git add src/features/painel/settled.ts src/features/painel/__tests__/settled.test.ts && git commit -m "feat: derive painel settled month and next-month preview"`

---

### Task 2 — "Mês quitado" card component

**Files:** `src/features/painel/SettledCard.tsx` (new)
**Needs context from:** Task 1 — `SettledSummary`, `NextMonthPreview`, `monthName`, `monthResultLine`

- [ ] Create `src/features/painel/SettledCard.tsx`:

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, useReducedMotion } from "react-native-reanimated";
import { formatBRL } from "../../domain/format";
import { fonts, radii } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { monthName, monthResultLine, type NextMonthPreview, type SettledSummary } from "./settled";

const plural = (n: number) => (n === 1 ? "conta" : "contas");

/**
 * Replaces the three KPI cards while every expense of the month is paid (spec 1, 4–9).
 * `preview` is null while the next month is loading or failed: the line is hidden.
 */
export function SettledCard({ month, summary, preview, onOpenNextMonth }: {
  month: string;
  summary: SettledSummary;
  preview: NextMonthPreview | null;
  onOpenNextMonth: (month: string) => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const result = monthResultLine(summary.result);

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(550)}
      style={{ backgroundColor: colors.okBg, borderRadius: radii.card, padding: 18, gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="checkmark-circle" size={26} color={colors.ok} />
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 26, color: colors.ok }}>
          {monthName(month)} quitado
        </Text>
      </View>
      <Text style={{ fontSize: 15, color: colors.ok }}>
        {formatBRL(summary.paidAmount)} pagos · {summary.paidCount} {plural(summary.paidCount)}
      </Text>
      <Text style={{ fontSize: 16, color: result.negative ? colors.danger : colors.ink }}>
        {result.label}: <Text style={{ fontWeight: "700" }}>{formatBRL(result.amount)}</Text>
      </Text>
      {summary.pendingIncome > 0 ? (
        <Text style={{ fontSize: 14, color: colors.inkSoft }}>Ainda falta receber {formatBRL(summary.pendingIncome)}</Text>
      ) : null}
      {preview ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Abre as contas do próximo mês"
          onPress={() => onOpenNextMonth(preview.month)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, paddingTop: 10,
            borderTopWidth: 1, borderTopColor: colors.hair, opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ flex: 1, fontSize: 14, color: colors.inkSoft }}>
            <Text style={{ fontWeight: "700", color: colors.ink }}>{monthName(preview.month)}:</Text>{" "}
            {preview.next
              ? `${formatBRL(preview.toPay)} a pagar · próxima: ${preview.next.description}, ${preview.next.when}`
              : "nada a pagar por enquanto"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
```

- [ ] Run: `bun run typecheck && bun run lint`. Expected: no errors (needs Task 1's `settled.ts`).
- [ ] Commit: `git add src/features/painel/SettledCard.tsx && git commit -m "feat: add painel settled month card"`

---

### Task 3 — Show the card on Painel

**Files:** `src/app/(tabs)/painel.tsx` (modified)
**Needs context from:** Task 1 — `deriveSettled`, `deriveNextMonthPreview`, `nextMonthOf`; Task 2 — `SettledCard` props

- [ ] In `src/app/(tabs)/painel.tsx`:
  - Add the imports:

```tsx
import { SettledCard } from "../../features/painel/SettledCard";
import { deriveNextMonthPreview, deriveSettled, nextMonthOf } from "../../features/painel/settled";
```

  - Add `useMonth` to the `../../hooks/data` import.
  - After `const kpis = derivePainelKpis(groups, bills.data);`, add:

```tsx
  // Spec 1–3: one "mês quitado" card replaces the KPI cards while every expense is paid.
  const settled = bills.data ? deriveSettled(bills.data.transactions ?? [], month, new Date()) : null;
  const nextMonth = nextMonthOf(month);
  const nextQuery = useQuery({ queryKey: ["month", nextMonth], queryFn: () => getMonth(nextMonth), enabled: !!settled });
  const preview = nextQuery.data ? deriveNextMonthPreview(nextQuery.data.transactions ?? [], nextMonth, new Date()) : null;
```

    Use the existing `useMonth(nextMonth)` hook instead, if it gains an `enabled` option. If it
    doesn't, import `useQuery` from `@tanstack/react-query` and `getMonth` from
    `../../api/endpoints`, as above. Do not change `src/hooks/data.ts` in this task; its file is
    not in this task's list.
  - In the focus-refetch loop, iterate `new Set([month, ...months, ...(settled ? [nextMonth] : [])])`
    and add `settled` and `nextMonth` to the `useCallback` deps.
  - In `refresh`, add `...(settled ? [nextQuery.refetch()] : [])` to the `Promise.all` list.
  - Replace `<KpiCards kpis={kpis} />` with:

```tsx
            {settled ? (
              <SettledCard
                month={month}
                summary={settled}
                preview={nextQuery.isError ? null : preview}
                onOpenNextMonth={(m) => router.push({ pathname: "/contas", params: { month: m } })}
              />
            ) : (
              <KpiCards kpis={kpis} />
            )}
```

  - Remove the `useMonth` import again if it ended up unused, so lint stays clean.
- [ ] Run: `bun run typecheck && bun run lint && bun run test`. Expected: no errors, all tests pass.
- [ ] Commit: `git add "src/app/(tabs)/painel.tsx" && git commit -m "feat: show settled month card on painel"`

---

### Task 4 — Simulator verification (inline, production account)

**Files:** none (verification only; any fix found becomes its own `fix:` commit)

The user's current month (October 2026) is already fully paid, so the settled state can be
checked without changing any data.

- [ ] Start Metro in the background: run `bunx expo start --dev-client` with
  `run_in_background`. Relaunch the installed dev build with
  `xcrun simctl launch booted com.felipeoliveira.financialconsultant`. Expected: the bundle loads
  from Metro.
- [ ] On Painel, confirm that:
  - the single card replaces the three KPI cards;
  - it shows "Outubro quitado", the paid line, "Sobrou no mês: R$ …", which should equal Contas'
    Recebido − Pago for October;
  - the November line shows the total to pay and the next bill.
- [ ] Tap the November line. Expected: Contas opens on "Novembro de 2026".
- [ ] Ask the user before checking the switch back to the three cards. That check undoes a real
  payment, so only with their OK:
  - in Contas, swipe a paid October expense to "Desfazer pagamento" and confirm Painel shows the
    three cards;
  - then pay it again and confirm the card returns.
  - Nothing is left changed.
- [ ] Report to the user with a screenshot of the card.

---

## Self-review

**Spec coverage:**
- Req 1–3 (settled rule, no expenses, switch back): Task 1 `deriveSettled` with tests (all paid,
  unpaid, projected, none, pending income, skipped) and Task 3's render switch. The live switch
  is checked in Task 4.
- Req 4 (headline): Task 1 `monthName` and Task 2.
- Req 5 (paid line): Task 1 `paidAmount`/`paidCount` and Task 2.
- Req 6 (Sobrou/Faltou): Task 1 `monthResultLine`, tested, and Task 2's alert colour.
- Req 7 (pending income): Task 1 `pendingIncome`, tested, and Task 2's conditional line.
- Req 8 (preview, nothing to pay): Task 1 `deriveNextMonthPreview`, tested, and Task 2.
- Req 9 (tap opens Contas on the next month): Task 3 `onOpenNextMonth`.
- Edge cases:
  - Next month loading or failed hides the line: Task 3 passes `preview` as null.
  - Current month loading: the card is only rendered inside the existing `hasData` branch.
  - December rollover: Task 1 `nextMonthOf`, tested.
  - Zero result: tested.

**Placeholder scan:** none found.

**Type/contract consistency:**
- Task 2 imports `SettledSummary`, `NextMonthPreview`, `monthName` and `monthResultLine` exactly
  as Task 1 exports them.
- Task 3 calls `deriveSettled(transactions, month, today)`,
  `deriveNextMonthPreview(transactions, nextMonth, today)` and `nextMonthOf(month)` with Task 1's
  signatures, and passes `SettledCard` the four props Task 2 declares.

**Task sizing:** no oversized tasks. Each touches one or two files.
