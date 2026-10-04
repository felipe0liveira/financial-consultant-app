import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TransactionGroup } from "../../api/types";
import { billStatusSentence, type BillViewModel } from "../../domain/bills";
import { formatBRL } from "../../domain/format";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";

/** Route of the native form sheet that shows a bill (see src/app/bill-details.tsx). */
export const BILL_DETAILS_ROUTE = "/bill-details";

/** Opens the bill details sheet; the bill travels as a route param (it is small and already loaded). */
export function useOpenBillDetails(): (bill: BillViewModel) => void {
  const router = useRouter();
  return useCallback(
    (bill: BillViewModel) => router.push({ pathname: BILL_DETAILS_ROUTE, params: { bill: JSON.stringify(bill) } }),
    [router]
  );
}

function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

/**
 * Read-only bill details (spec D1, D2). Rendered inside a native form sheet sized to its
 * content, so it must not use flex: 1 or a ScrollView — the sheet measures this view.
 */
export function BillDetailsContent({ bill, groups = [], onClose }: { bill: BillViewModel; groups?: TransactionGroup[]; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tags = [
    bill.category,
    bill.recurring_rule_id ? "Recorrente" : null,
    bill.installment ? `Parcela ${bill.installment.current}/${bill.installment.total}` : null,
    ...groups.filter((g) => bill.group_ids.includes(g.group_id)).map((g) => g.name),
  ].filter((t): t is string => !!t);

  return (
    <View style={{ backgroundColor: colors.panel, paddingHorizontal: 24, paddingTop: 28, paddingBottom: Math.max(insets.bottom, 24), gap: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>Detalhes da conta</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={12}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Fechar</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 22, fontWeight: "600", color: colors.ink }}>{bill.description}</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: bill.amount > 0 ? colors.ok : colors.ink }}>
        {formatBRL(Math.abs(bill.amount))}
      </Text>
      <Text style={{ fontSize: 16, color: colors.inkSoft }}>{billStatusSentence(bill)}</Text>
      {tags.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tags.map((t) => <Tag key={t} label={t} />)}
        </View>
      ) : null}
      {bill.comment ? (
        <View style={{ gap: 4 }}>
          <Text style={{ fontWeight: "600", color: colors.ink }}>Comentário</Text>
          <Text style={{ color: colors.inkSoft }}>{bill.comment}</Text>
        </View>
      ) : null}
    </View>
  );
}
