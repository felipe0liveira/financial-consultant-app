import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { TransactionGroup } from "../../api/types";
import { billStatusSentence, type BillViewModel } from "../../domain/bills";
import { formatBRL } from "../../domain/format";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";

function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function BillDetailsSheet({ bill, groups = [], onClose }: { bill: BillViewModel | null; groups?: TransactionGroup[]; onClose: () => void }) {
  const { colors } = useTheme();
  const tags = bill ? [
    bill.category,
    bill.recurring_rule_id ? "Recorrente" : null,
    bill.installment ? `Parcela ${bill.installment.current}/${bill.installment.total}` : null,
    ...groups.filter((g) => bill.group_ids.includes(g.group_id)).map((g) => g.name),
  ].filter((t): t is string => !!t) : [];
  return (
    <Modal visible={!!bill} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {bill ? (
        <ScrollView style={{ backgroundColor: colors.panel }} contentContainerStyle={{ padding: 24, gap: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>Detalhes da conta</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.accent, fontSize: 16 }}>Fechar</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "600", color: colors.ink }}>{bill.description}</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: bill.amount > 0 ? colors.ok : colors.ink }}>{formatBRL(Math.abs(bill.amount))}</Text>
          <Text style={{ fontSize: 16, color: colors.inkSoft }}>{billStatusSentence(bill)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{tags.map((t) => <Tag key={t} label={t} />)}</View>
          {bill.comment ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontWeight: "600", color: colors.ink }}>Comentário</Text>
              <Text style={{ color: colors.inkSoft }}>{bill.comment}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Modal>
  );
}
