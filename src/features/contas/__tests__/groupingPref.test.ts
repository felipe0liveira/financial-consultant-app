jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { loadGrouping, parseGrouping, saveGrouping } from "../groupingPref";

test("unknown values fall back to status", () => {
  expect(parseGrouping(null)).toBe("status");
  expect(parseGrouping("nope")).toBe("status");
});
test("C6: grouping round-trips through storage", async () => {
  await saveGrouping("category");
  expect(await loadGrouping()).toBe("category");
});
