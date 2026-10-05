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
