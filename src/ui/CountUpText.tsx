import { useEffect, useState } from "react";
import { Text, type TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { COUNT_UP_MS, countUpValue } from "./countUp";

/** Counts a number up on first display (spec P2); renders the final value with Reduce Motion (M2). */
export function CountUpText({ value, format, style }: { value: number; format: (n: number) => string; style?: TextStyle }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setShown(countUpValue(value, elapsed));
      if (elapsed < COUNT_UP_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <Text style={style} accessibilityLabel={format(value)}>{format(reduced ? value : shown)}</Text>;
}
