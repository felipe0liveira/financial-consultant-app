import { useEffect, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { formatBRL0 } from "../../domain/format";
import { useTheme } from "../../theme/ThemeProvider";
import { arcPath, donutArcs } from "./geometry";

export interface DonutEntry { name: string; value: number; color: string }

export function DonutChart({ data, size = 140 }: { data: DonutEntry[]; size?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [fade] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { fade.setValue(1); return; }
    Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [fade, reduced]);
  const arcs = donutArcs(data.map((d) => d.value));
  const r = size / 2 - 12;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
      <Animated.View style={{ opacity: fade }}>
        <Svg width={size} height={size}>
          {arcs.map(([s, e], i) => (
            <Path key={data[i].name} d={arcPath(size / 2, size / 2, r, s, e)} stroke={data[i].color} strokeWidth={20} fill="none" />
          ))}
        </Svg>
      </Animated.View>
      <View style={{ flex: 1, gap: 6 }}>
        {data.map((d) => (
          <View key={d.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: d.color }} />
            <Text numberOfLines={1} style={{ flex: 1, color: colors.ink }}>{d.name}</Text>
            <Text style={{ color: colors.inkSoft, fontVariant: ["tabular-nums"] }}>{formatBRL0(d.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
