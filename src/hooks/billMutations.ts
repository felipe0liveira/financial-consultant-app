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
/** Returns true when the action started (false when blocked offline). */
export function useSetBillConfirmed(): (tx: Transaction, month: string) => boolean {
  const qc = useQueryClient();
  const toast = useToast();

  return useCallback(
    (tx: Transaction, month: string): boolean => {
      if (!onlineManager.isOnline()) {
        toast({ message: OFFLINE_MESSAGE, tone: "error" });
        return false;
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
      return true;
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
