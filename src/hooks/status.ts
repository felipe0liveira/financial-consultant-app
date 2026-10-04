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
  const active = isFetching && hasData;
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setElapsed(true), REFRESH_NOTICE_DELAY_MS + 1);
    return () => {
      clearTimeout(id);
      setElapsed(false);
    };
  }, [active]);
  return active && elapsed;
}
