import { useEffect, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";
import { areaPath } from "./geometry";

export function AreaChart({ values, labels, height = 140 }: { values: number[]; labels: string[]; height?: number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [reveal] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const valuesKey = values.join(",");
  useEffect(() => {
    if (reduced || width === 0) { reveal.setValue(1); return; }
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 1400, useNativeDriver: false }).start();
  }, [valuesKey, width, reduced, reveal]);
  const { line, area } = areaPath(values, width, height);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Gráfico de gastos por mês">
      <Animated.View style={{ height, overflow: "hidden", width: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#fill)" />
            <Path d={line} stroke={colors.accent} strokeWidth={2.5} fill="none" />
          </Svg>
        ) : null}
      </Animated.View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        {labels.map((l) => <Text key={l} style={{ color: colors.inkFaint, fontSize: 12 }}>{l}</Text>)}
      </View>
    </View>
  );
}
