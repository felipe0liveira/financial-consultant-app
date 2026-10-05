import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import type { Transaction } from "../api/types";
import { toBillViewModels } from "../domain/bills";
import { useGroups } from "../hooks/data";
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
  // Local copy so the sheet re-derives in place after pay/undo.
  const [tx, setTx] = useState<Transaction | null>(() => parseTransaction(params.bill));
  const bill = useMemo(
    () => (tx && month ? toBillViewModels([tx], month, new Date())[0] ?? null : null),
    [tx, month]
  );

  if (!bill) return null;
  return (
    <BillDetailsContent
      bill={bill}
      month={month}
      groups={groups}
      onClose={() => router.back()}
      onConfirmedChange={(confirmed) => setTx((t) => (t ? { ...t, confirmed } : t))}
    />
  );
}
