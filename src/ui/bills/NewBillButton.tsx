import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

/** Route of the Nova conta sheet (see src/app/new-bill.tsx). */
export const NEW_BILL_ROUTE = "/new-bill";

/** Round coral "+" that opens Nova conta with the date defaulting to the 1st of `month` (spec 1, 2). */
export function NewBillButton({ month }: { month: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nova conta"
      hitSlop={8}
      onPress={() => router.push({ pathname: NEW_BILL_ROUTE, params: { month } })}
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
        backgroundColor: pressed ? colors.accentPressed : colors.accent,
      })}
    >
      <Ionicons name="add" size={26} color="#FFFFFF" />
    </Pressable>
  );
}
