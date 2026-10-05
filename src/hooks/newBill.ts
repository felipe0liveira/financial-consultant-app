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
