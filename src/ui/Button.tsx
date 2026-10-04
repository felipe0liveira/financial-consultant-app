import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import { radii } from "../theme/tokens";
import { useTheme } from "../theme/ThemeProvider";

interface Props extends Omit<PressableProps, "children"> {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ label, loading, variant = "primary", disabled, ...rest }: Props) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.accent : variant === "danger" ? colors.dangerBg : colors.card;
  const fg = variant === "primary" ? "#FFFFFF" : variant === "danger" ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radii.button,
        borderWidth: variant === "primary" ? 0 : 1,
        borderColor: colors.hair,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
