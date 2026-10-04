import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import { SessionExpiredError } from "../api/client";

export const STALE_TIME_MS = 30 * 1000; // spec F2
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // spec F3
export const CACHE_BUSTER = "1";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      gcTime: CACHE_MAX_AGE_MS,
      retry: (count, error) => !(error instanceof SessionExpiredError) && count < 2,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "fc-query-cache",
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

AppState.addEventListener("change", (status) => focusManager.setFocused(status === "active"));

/** Drops every cached query, in memory and on disk (owner guard, spec A1). */
export async function clearQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}

/**
 * Owner changed while screens are mounted: drops the persisted cache, then resets every query to
 * its initial state, which refetches the active ones (spec A1).
 */
export async function resetForNewOwner(): Promise<void> {
  await persister.removeClient();
  await queryClient.resetQueries();
}
