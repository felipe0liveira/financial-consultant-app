import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import type { BillViewModel } from "../domain/bills";
import { useGroups } from "../hooks/data";
import { BillDetailsContent } from "../ui/bills/BillDetailsSheet";

/** Native form sheet (fit to contents) with a bill's read-only details. */
export default function BillDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bill?: string }>();
  const groups = useGroups().data?.items ?? [];
  const bill = useMemo<BillViewModel | null>(() => {
    try {
      return params.bill ? (JSON.parse(params.bill) as BillViewModel) : null;
    } catch {
      return null;
    }
  }, [params.bill]);

  if (!bill) return null;
  return <BillDetailsContent bill={bill} groups={groups} onClose={() => router.back()} />;
}
