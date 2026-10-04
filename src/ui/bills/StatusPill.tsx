import { Text, View } from "react-native";
import { billStatusColors, billStatusLabel, type BillViewModel } from "../../domain/bills";
import { useTheme } from "../../theme/ThemeProvider";

export function StatusPill({ bill }: { bill: BillViewModel }) {
  const { colors } = useTheme();
  const c = billStatusColors(bill.status);
  return (
    <View style={{ backgroundColor: colors[c.bg], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: colors[c.text], fontSize: 12, fontWeight: "600" }}>{billStatusLabel(bill)}</Text>
    </View>
  );
}
