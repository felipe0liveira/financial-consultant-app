// Native iOS tab bar: on iOS 26+ the system draws the floating Liquid Glass bar; earlier iOS
// versions get the classic native bar. `unstable-native-tabs` becomes `native-tabs` on SDK 58.
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { currentMonth } from "../../domain/bills";
import { useBills } from "../../hooks/data";
import { useTheme } from "../../theme/ThemeProvider";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { groups } = useBills(currentMonth());
  const unpaid = (groups ?? []).filter((g) => g.status !== "paid").reduce((n, g) => n + g.bills.length, 0);
  return (
    <NativeTabs tintColor={colors.accent} badgeBackgroundColor={colors.danger} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="painel">
        <NativeTabs.Trigger.Icon sf="house" />
        <NativeTabs.Trigger.Label>Painel</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="contas">
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle" />
        <NativeTabs.Trigger.Label>Contas</NativeTabs.Trigger.Label>
        {/* Rendered only when there is something unpaid: `hidden` still shows "0" on iOS. */}
        {unpaid > 0 ? <NativeTabs.Trigger.Badge>{String(unpaid)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="mais">
        <NativeTabs.Trigger.Icon sf="ellipsis" />
        <NativeTabs.Trigger.Label>Mais</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
