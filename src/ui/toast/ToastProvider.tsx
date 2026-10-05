import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";
import { nextToast, TOAST_DURATION_MS, type ToastSpec, type ToastState } from "./toastQueue";

const ToastContext = createContext<((spec: ToastSpec) => void) | null>(null);
/** Space reserved above the floating tab bar. */
const TAB_BAR_CLEARANCE = 72;

export function ToastProvider({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [toast, setToast] = useState<ToastState | null>(null);
  const seq = useRef(0);

  const show = useCallback((spec: ToastSpec) => {
    seq.current += 1;
    const id = seq.current;
    setToast((cur) => nextToast(cur, spec, id));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const bg = toast?.tone === "error" ? colors.danger : colors.ink;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={reduced ? undefined : FadeInDown.duration(200)}
          exiting={reduced ? undefined : FadeOutDown.duration(200)}
          pointerEvents="box-none"
          style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + TAB_BAR_CLEARANCE }}
        >
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: bg, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}
          >
            <Text style={{ flex: 1, color: colors.panel, fontSize: 15 }}>{toast.message}</Text>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                onPress={() => { toast.onAction?.(); setToast(null); }}
                hitSlop={8}
              >
                <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 15 }}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (spec: ToastSpec) => void {
  const v = use(ToastContext);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}
