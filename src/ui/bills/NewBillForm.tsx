import { Button as SwiftButton, DatePicker, Divider, Host, Menu } from "@expo/ui/swift-ui";
import { datePickerStyle, environment } from "@expo/ui/swift-ui/modifiers";
import { onlineManager } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BillDirection } from "../../api/types";
import { OFFLINE_MESSAGE } from "../../domain/billActions";
import { currentMonth, DEFAULT_CATEGORIES, mergeCategories } from "../../domain/bills";
import { digitsToCents, formatCents } from "../../domain/money";
import {
  buildCreateBillInput, canBackfill, categoryErrorMessage, createBillErrorMessage, createdMessage, findCategory,
  formatDateBR, initialNewBillForm, installmentHint, isNewBillDirty, parseInstallment, recurringHint,
  updateNewBillForm, validateNewBill, type NewBillForm as FormState,
} from "../../domain/newBill";
import { useAddCategory, useCategories, useCreateBill } from "../../hooks/newBill";
import { fonts } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useToast } from "../toast/ToastProvider";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.inkSoft, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * "Nova conta" form inside a large native form sheet (spec 3–18). Not optimistic: Salvar waits
 * for the server, then closes the sheet and toasts. Errors stay inline — the global toast sits
 * under the native sheet.
 */
export function NewBillForm({ month, onClose }: { month: string; onClose: () => void }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const toast = useToast();
  const createBill = useCreateBill();
  const addCategory = useAddCategory();
  const catalog = useCategories().data;

  const [initial] = useState(() => initialNewBillForm(month));
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Synchronous guard: two taps before the re-render must not send two POSTs (spec 15).
  const savingRef = useRef(false);

  const set = (patch: Partial<FormState>) => setForm((f) => updateNewBillForm(f, patch, currentMonth()));
  const installment = parseInstallment(form.description);
  const options = useMemo(() => mergeCategories(catalog, DEFAULT_CATEGORIES, [form.category]), [catalog, form.category]);
  const dirty = isNewBillDirty(form, initial);

  // Swipe-down and Cancelar both land here (spec 18); ignored while saving (spec 15).
  usePreventRemove((dirty || saving) && !done, ({ data }) => {
    if (saving) return;
    Alert.alert("Descartar esta conta?", undefined, [
      { text: "Continuar editando", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  // Close only after usePreventRemove has been released by `done`.
  useEffect(() => {
    if (!done) return;
    onClose();
    toast({ message: done });
  }, [done, onClose, toast]);

  const save = async () => {
    if (savingRef.current) return;
    const invalid = validateNewBill(form);
    if (invalid) { setError(invalid); return; }
    if (!onlineManager.isOnline()) { setError(OFFLINE_MESSAGE); return; }
    setError(null);
    savingRef.current = true;
    setSaving(true);
    const input = buildCreateBillInput(form, currentMonth());
    try {
      await createBill.mutateAsync(input);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(createdMessage(input));
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(createBillErrorMessage(e));
      savingRef.current = false;
      setSaving(false);
    }
  };

  const createCategory = async (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const existing = findCategory(options, name);
    if (existing) { setError(null); set({ category: existing }); return; }
    if (!onlineManager.isOnline()) { setError(OFFLINE_MESSAGE); return; }
    try {
      const res = await addCategory.mutateAsync(name);
      setError(null);
      set({ category: res.name || name });
    } catch (e) {
      setError(categoryErrorMessage(e));
    }
  };

  const askNewCategory = () =>
    Alert.prompt("Nova categoria", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Criar", onPress: (value?: string) => void createCategory(value ?? "") },
    ], "plain-text");

  const inputStyle = { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 16 } as const;
  const directionChip = (value: BillDirection, label: string) => {
    const on = form.direction === value;
    return (
      <Pressable
        key={value}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => set({ direction: value })}
        style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: on ? colors.panel : "transparent" }}
      >
        <Text style={{ color: on ? colors.ink : colors.inkSoft, fontWeight: on ? "700" : "500" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar" onPress={onClose} hitSlop={12} disabled={saving}>
          <Text style={{ color: colors.accent, fontSize: 16, opacity: saving ? 0.5 : 1 }}>Cancelar</Text>
        </Pressable>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink }}>Nova conta</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={saving ? "Salvando…" : "Salvar"} accessibilityState={{ busy: saving, disabled: saving }} onPress={() => void save()} hitSlop={12} disabled={saving}>
          <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700", opacity: saving ? 0.6 : 1 }}>{saving ? "Salvando…" : "Salvar"}</Text>
        </Pressable>
      </View>
      {/* Pinned under the top bar so it is never below the fold or behind the keyboard. */}
      {error ? (
        <Text accessibilityRole="alert" style={{ marginHorizontal: 20, marginBottom: 12, color: colors.danger, backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, overflow: "hidden" }}>
          {error}
        </Text>
      ) : null}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 24, gap: 18 }}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View pointerEvents={saving ? "none" : "auto"} style={{ gap: 18, opacity: saving ? 0.7 : 1 }}>
          <Field label="Categoria">
            <Host matchContents colorScheme={scheme} seedColor={colors.accent}>
              <Menu label={form.category} systemImage="chevron.up.chevron.down">
                {options.map((name) => (
                  <SwiftButton key={name} label={name} systemImage={name === form.category ? "checkmark" : undefined} onPress={() => set({ category: name })} />
                ))}
                <Divider />
                <SwiftButton label="Nova categoria…" systemImage="plus" onPress={askNewCategory} />
              </Menu>
            </Host>
          </Field>

          <Field label="Descrição">
            <TextInput
              value={form.description}
              onChangeText={(description) => set({ description })}
              placeholder="Ex.: Conta de luz"
              placeholderTextColor={colors.inkFaint}
              accessibilityLabel="Descrição"
              editable={!saving}
              style={inputStyle}
            />
            {installment ? <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{installmentHint(installment)}</Text> : null}
          </Field>

          <Field label="Tipo">
            <View accessibilityRole="radiogroup" style={{ flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 4 }}>
              {directionChip("out", "Saída")}
              {directionChip("in", "Entrada")}
            </View>
          </Field>

          <Field label="Valor (R$)">
            <TextInput
              value={form.cents === null ? "" : formatCents(form.cents)}
              onChangeText={(text) => set({ cents: digitsToCents(text) })}
              placeholder="R$ 0,00"
              placeholderTextColor={colors.inkFaint}
              keyboardType="number-pad"
              accessibilityLabel="Valor"
              editable={!saving}
              style={inputStyle}
            />
          </Field>

          <Field label="Data">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Data, ${formatDateBR(form.date)}`}
              onPress={() => setCalendarOpen((o) => !o)}
              style={inputStyle}
            >
              <Text style={{ color: colors.ink, fontSize: 16 }}>{formatDateBR(form.date)}</Text>
            </Pressable>
            {calendarOpen ? (
              <Host matchContents colorScheme={scheme} seedColor={colors.accent}>
                <DatePicker
                  selection={form.date}
                  displayedComponents={["date"]}
                  modifiers={[datePickerStyle("graphical"), environment({ key: "locale", value: "pt_BR" })]}
                  onDateChange={(date) => {
                    set({ date: new Date(date.getFullYear(), date.getMonth(), date.getDate()) });
                    setCalendarOpen(false);
                  }}
                />
              </Host>
            ) : null}
          </Field>

          <View style={{ gap: 6, opacity: installment ? 0.5 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, fontSize: 16 }}>Repetir todo mês</Text>
              <Switch
                accessibilityLabel="Repetir todo mês"
                value={installment ? false : form.recurring}
                disabled={!!installment}
                onValueChange={(recurring) => set({ recurring })}
                trackColor={{ true: colors.accent }}
              />
            </View>
            {form.recurring && !installment ? <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{recurringHint(form.date)}</Text> : null}
          </View>

          {canBackfill(form, currentMonth()) ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 16 }}>Já venho pagando desde então</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 13 }}>Marca os meses anteriores como pagos</Text>
              </View>
              <Switch
                accessibilityLabel="Já venho pagando desde então"
                value={form.backfillPaid}
                onValueChange={(backfillPaid) => set({ backfillPaid })}
                trackColor={{ true: colors.accent }}
              />
            </View>
          ) : null}

        </View>
      </ScrollView>
    </View>
  );
}
