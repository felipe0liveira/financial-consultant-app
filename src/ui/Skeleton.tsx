import { useEffect, useState } from "react";
import { Animated, type DimensionValue } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";

export function Skeleton({ height, width = "100%", radius = 12 }: { height: number; width?: DimensionValue; radius?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return <Animated.View accessibilityLabel="Carregando" style={{ height, width, borderRadius: radius, backgroundColor: colors.hair, opacity }} />;
}
