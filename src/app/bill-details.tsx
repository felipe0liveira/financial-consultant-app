import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import type { Transaction } from "../api/types";
import { toBillViewModels } from "../domain/bills";
import { useGroups, useMonth, useMonthTransactions } from "../hooks/data";
import { BillDetailsContent } from "../ui/bills/BillDetailsSheet";

function parseTransaction(raw?: string): Transaction | null {
  try {
    return raw ? (JSON.parse(raw) as Transaction) : null;
  } catch {
    return null;
  }
}

/** Native form sheet (fit to contents) with a bill's details and pay/undo/delete actions. */
export default function BillDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bill?: string; month?: string }>();
  const month = params.month ?? "";
  const groups = useGroups().data?.items ?? [];
  const param = useMemo(() => parseTransaction(params.bill), [params.bill]);

  // Same queries the screens use (already cached): the sheet follows optimistic patches, rollbacks and undo.
  const summary = useMonth(month).data;
  const listed = useMonthTransactions(month).transactions;

  const bill = useMemo(() => {
    if (!param || !month) return null;
    const isSame = (t: Transaction) =>
      t.description === param.description && t.day === param.day && t.amount === param.amount;
    const live =
      listed.find(isSame) ?? (summary?.transactions ?? []).find(isSame);
    return toBillViewModels([live ?? param], month, new Date())[0] ?? null;
  }, [param, month, summary, listed]);

  if (!bill) return null;
  return (
    <BillDetailsContent
      bill={bill}
      month={month}
      groups={groups}
      onClose={() => router.back()}
    />
  );
}
