import { useRef, useState, type ComponentProps } from "react";
import { Alert, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useAnimatedReaction, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { currentMonth } from "../../domain/bills";
import { deleteConfirmCopy, paySideAction } from "../../domain/billActions";
import { useDeleteBill, useRequireOnline, useSetBillConfirmed } from "../../hooks/billMutations";
import { useTheme } from "../../theme/ThemeProvider";
import { BillRow } from "./BillRow";
import { isFullSwipe, PAY_LABELS } from "./swipe";

/** Ignore a row press this soon after a swipe gesture started. */
const DRAG_PRESS_GUARD_MS = 400;

type Props = ComponentProps<typeof BillRow> & { month: string };

const ACTION_WIDTH = 96;

/** Mirrors the swipe translation to the JS thread so a release can be classified as a full swipe. */
function TrackTranslation({ translation, onChange }: { translation: SharedValue<number>; onChange: (x: number) => void }) {
  useAnimatedReaction(
    () => translation.value,
    (x) => { scheduleOnRN(onChange, x); },
  );
  return null;
}

/** A bill row with Mail-style swipe actions (spec Q1, Q2, Q6, Q7, Q16). */
export function SwipeableBillRow({ month, ...rowProps }: Props) {
  const { colors } = useTheme();
  const { bill } = rowProps;
  const setConfirmed = useSetBillConfirmed();
  const deleteBill = useDeleteBill();
  const requireOnline = useRequireOnline();
  const ref = useRef<SwipeableMethods>(null);
  const lastX = useRef(0);
  // A drag must never also open the details (iOS Mail behaviour): a press that lands within
  // DRAG_PRESS_GUARD_MS of a drag, or while the actions are open, only closes the row.
  const lastDragAt = useRef(0);
  const isOpen = useRef(false);
  const [width, setWidth] = useState(0);
  const side = paySideAction(bill);

  const trackX = (x: number) => { lastX.current = x; };
  const pay = () => { ref.current?.close(); setConfirmed(bill, month); };
  const askDelete = () => {
    ref.current?.close();
    if (!requireOnline()) return;
    const copy = deleteConfirmCopy(bill, month, currentMonth());
    Alert.alert(copy.title, copy.message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deleteBill(bill, month, copy.seriesId) },
    ]);
  };

  const onRowPress = () => {
    if (isOpen.current || Date.now() - lastDragAt.current < DRAG_PRESS_GUARD_MS) {
      ref.current?.close();
      return;
    }
    rowProps.onPress();
  };

  const payBg = side === "unpay" ? colors.inkSoft : colors.ok;
  // The panel is ACTION_WIDTH wide (so the row rests there when opened); the coloured fill
  // extends over the whole row so a long drag keeps showing the action colour.
  const action = (label: string, bg: string, onPress: () => void, edge: "left" | "right") => (
    <View style={{ width: ACTION_WIDTH }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, width: width || 400, backgroundColor: bg, [edge]: 0 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 }}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "700", textAlign: "center" }}>{label}</Text>
      </Pressable>
    </View>
  );

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible={false}
    >
      <ReanimatedSwipeable
        ref={ref}
        friction={1}
        overshootLeft
        overshootRight
        leftThreshold={ACTION_WIDTH / 2}
        rightThreshold={ACTION_WIDTH / 2}
        // In RNGH 2.32, swiping RIGHT opens renderLeftActions and reports SwipeDirection.RIGHT.
        renderLeftActions={(_p, translation) => (
          <>
            <TrackTranslation translation={translation} onChange={trackX} />
            {action(PAY_LABELS[side], payBg, pay, "left")}
          </>
        )}
        renderRightActions={(_p, translation) => (
          <>
            <TrackTranslation translation={translation} onChange={trackX} />
            {action("Excluir", colors.danger, askDelete, "right")}
          </>
        )}
        onSwipeableOpenStartDrag={() => { lastDragAt.current = Date.now(); }}
        onSwipeableCloseStartDrag={() => { lastDragAt.current = Date.now(); }}
        onSwipeableOpen={() => { isOpen.current = true; }}
        onSwipeableClose={() => { isOpen.current = false; }}
        onSwipeableWillOpen={(direction) => {
          if (!isFullSwipe(lastX.current, width)) return;
          if (direction === SwipeDirection.RIGHT) pay(); else askDelete();
        }}
      >
        <View style={{ backgroundColor: colors.panel }}>
          <BillRow
            {...rowProps}
            onPress={onRowPress}
            accessibilityActions={[{ name: "pay", label: PAY_LABELS[side] }, { name: "delete", label: "Excluir" }]}
            onAccessibilityAction={(e) => (e.nativeEvent.actionName === "pay" ? pay() : askDelete())}
          />
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}
