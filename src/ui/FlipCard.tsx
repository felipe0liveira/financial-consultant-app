import { useState, type ReactNode } from "react";
import { Pressable, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

/** Tap to flip between two faces (spec P2, C2). `initialBack` opens on the back face. */
export function FlipCard({ front, back, style, initialBack = false, label }: {
  front: ReactNode; back: ReactNode; style?: ViewStyle; initialBack?: boolean; label: string;
}) {
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(initialBack);
  // 0 = front face, 1 = back face; driven on the UI thread so the flip animates on change.
  const progress = useSharedValue(initialBack ? 1 : 0);
  const duration = reduced ? 0 : 500;

  const onPress = () => {
    const next = !flipped;
    setFlipped(next);
    progress.value = withTiming(next ? 1 : 0, { duration });
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${progress.value * 180}deg` }],
    backfaceVisibility: "hidden",
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${180 + progress.value * 180}deg` }],
    backfaceVisibility: "hidden",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Toque para alternar" onPress={onPress} style={style}>
      <Animated.View style={frontStyle}>{front}</Animated.View>
      <Animated.View style={backStyle}>{back}</Animated.View>
    </Pressable>
  );
}
