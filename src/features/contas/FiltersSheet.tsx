import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  BILL_STATUS_FILTERS,
  DEFAULT_BILL_FILTERS,
  type BillFilters,
  type BillGroupingMode,
} from "../../domain/bills";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../../ui/Button";

interface Props {
  visible: boolean;
  filters: BillFilters;
  grouping: BillGroupingMode;
  categories: string[];
  hasGroups: boolean;
  previewCount: (filters: BillFilters) => number;
  onApply: (filters: BillFilters, grouping: BillGroupingMode) => void;
  onClose: () => void;
}

const GROUPINGS: { value: BillGroupingMode; label: string }[] = [
  { value: "status", label: "Situação" },
  { value: "category", label: "Categoria" },
  { value: "group", label: "Grupo" },
];

export function FiltersSheet(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <SafeAreaProvider>
        {/* Mounted only while visible, so the draft is re-initialised from props on every open. */}
        {props.visible ? <SheetContent {...props} /> : null}
      </SafeAreaProvider>
    </Modal>
  );
}

function SheetContent({ filters, grouping, categories, hasGroups, previewCount, onApply, onClose }: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<BillFilters>(filters);
  const [draftGrouping, setDraftGrouping] = useState<BillGroupingMode>(grouping);

  const chip = (label: string, selected: boolean, onPress: () => void, disabled = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: selected ? colors.accent : colors.card,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: selected ? "#FFFFFF" : colors.ink, fontWeight: "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  const heading = (text: string) => (
    <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 13, textTransform: "uppercase" }}>{text}</Text>
  );

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.panel }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink }}>Filtros</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.accent, fontWeight: "600", fontSize: 16 }}>Fechar</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View style={{ gap: 10 }}>
          {heading("Agrupar por")}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {GROUPINGS.map((g) =>
              chip(g.label, draftGrouping === g.value, () => setDraftGrouping(g.value), g.value === "group" && !hasGroups)
            )}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {heading("Situação")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {BILL_STATUS_FILTERS.map((s) =>
              chip(s.label, draft.status === s.value, () => setDraft({ ...draft, status: s.value }))
            )}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          {heading("Categoria")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {chip("Todas categorias", draft.category === "all", () => setDraft({ ...draft, category: "all" }))}
            {categories.map((c) => chip(c, draft.category === c, () => setDraft({ ...draft, category: c })))}
          </View>
        </View>
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpar"
          onPress={() => {
            setDraft(DEFAULT_BILL_FILTERS);
            setDraftGrouping("status");
          }}
          style={{ paddingVertical: 14, paddingHorizontal: 8 }}
        >
          <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 16 }}>Limpar</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Button label={`Ver ${previewCount(draft)} contas`} onPress={() => onApply(draft, draftGrouping)} />
        </View>
      </View>
    </SafeAreaView>
  );
}
