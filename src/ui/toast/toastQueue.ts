export const TOAST_DURATION_MS = 5000; // spec Q5

export interface ToastSpec { message: string; actionLabel?: string; onAction?: () => void; tone?: "neutral" | "error" }
export interface ToastState extends ToastSpec { id: number }

/** The next toast replaces the current one (spec Q5). */
export function nextToast(_current: ToastState | null, spec: ToastSpec, id: number): ToastState {
  return { ...spec, id };
}
