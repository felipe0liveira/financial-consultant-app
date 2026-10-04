import { Pressable, Text, View } from "react-native";
import type { TransactionGroup } from "../../api/types";
import type { BillViewModel } from "../../domain/bills";
import { formatBRL } from "../../domain/format";
import { useTheme } from "../../theme/ThemeProvider";
import { CategoryIcon } from "./CategoryIcon";
import { StatusPill } from "./StatusPill";

export function BillRow({ bill, groups = [], hideGroupId = null, showPill, onPress }: {
  bill: BillViewModel; groups?: TransactionGroup[]; hideGroupId?: string | null; showPill: boolean; onPress: () => void;
}) {
  const { colors } = useTheme();
  const chips = groups.filter((g) => bill.group_ids.includes(g.group_id) && g.group_id !== hideGroupId);
  const hints = [bill.recurring_rule_id ? "Recorrente" : null, bill.installment ? `Parcela ${bill.installment.current}/${bill.installment.total}` : null].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bill.description}, ${formatBRL(Math.abs(bill.amount))}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
    >
      <CategoryIcon category={bill.category} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, color: colors.ink }}>{bill.description}</Text>
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.inkSoft }}>
          {[bill.category, ...hints].join(" · ")}
          {chips.length ? ` · ${chips.slice(0, 2).map((g) => g.name).join(", ")}${chips.length > 2 ? ` +${chips.length - 2}` : ""}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"], color: bill.amount > 0 ? colors.ok : colors.ink }}>
          {formatBRL(Math.abs(bill.amount))}
        </Text>
        {showPill ? <StatusPill bill={bill} /> : null}
      </View>
    </Pressable>
  );
}
