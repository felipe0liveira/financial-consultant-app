import { useEffect, useRef, useState } from "react";
import { Text, type TextStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { COUNT_UP_MS, countUpValue } from "./countUp";

type Anim = { started: boolean; target: number; value: number };

/**
 * Counts a number up on first display only (spec P2): the animation runs from 0 on the first
 * non-zero value after mount; later value changes render immediately. Reduce Motion renders the
 * final value (M2).
 */
export function CountUpText({ value, format, style }: { value: number; format: (n: number) => string; style?: TextStyle }) {
  const reduced = useReducedMotion();
  const [anim, setAnim] = useState<Anim>({ started: false, target: 0, value: 0 });
  const played = useRef(false);
  useEffect(() => {
    if (reduced || played.current || value === 0) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      played.current = true;
      const elapsed = Date.now() - start;
      setAnim({ started: true, target: value, value: countUpValue(value, elapsed) });
      if (elapsed < COUNT_UP_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  // Before the animation starts show 0; once it ran, a stale target means the value changed -> show it as is.
  const shown = reduced ? value : anim.started ? (anim.target === value ? anim.value : value) : 0;
  return <Text style={style} accessibilityLabel={format(value)}>{format(shown)}</Text>;
}
