import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BILL_STATUS_FILTERS, type BillFilters } from "../../domain/bills";
import { useTheme } from "../../theme/ThemeProvider";

interface Props {
  filters: BillFilters;
  onChange: (filters: BillFilters) => void;
}

/** Applied Contas filters as removable chips; renders nothing when none is active. */
export function FilterChips({ filters, onChange }: Props) {
  const { colors } = useTheme();
  const chips: { key: keyof BillFilters; label: string }[] = [];
  if (filters.status !== "all") {
    const label = BILL_STATUS_FILTERS.find((s) => s.value === filters.status)?.label ?? filters.status;
    chips.push({ key: "status", label });
  }
  if (filters.category !== "all") chips.push({ key: "category", label: filters.category });
  if (chips.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {chips.map((chip) => (
        <View
          key={chip.key}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 32, paddingLeft: 12, paddingRight: 4, borderRadius: 16, backgroundColor: colors.accentBg }}
        >
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}>{chip.label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remover filtro ${chip.label}`}
            hitSlop={6}
            onPress={() => onChange({ ...filters, [chip.key]: "all" })}
            style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="close" size={14} color={colors.accent} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
