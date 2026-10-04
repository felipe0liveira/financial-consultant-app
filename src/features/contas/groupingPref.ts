import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BillGroupingMode } from "../../domain/bills";

const KEY = "fc-contas-grouping";
const MODES: BillGroupingMode[] = ["status", "category", "group"];

export function parseGrouping(raw: string | null): BillGroupingMode {
  return MODES.includes(raw as BillGroupingMode) ? (raw as BillGroupingMode) : "status";
}
export async function loadGrouping(): Promise<BillGroupingMode> {
  return parseGrouping(await AsyncStorage.getItem(KEY).catch(() => null));
}
export async function saveGrouping(mode: BillGroupingMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode).catch(() => {});
}
