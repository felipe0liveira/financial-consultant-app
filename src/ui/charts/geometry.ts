/** SVG path for an area chart: points spread evenly across width, scaled to max. */
export function areaPath(values: number[], width: number, height: number): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, height - (v / max) * height] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${(pts[pts.length - 1][0]).toFixed(1)},${height} L0,${height} Z`;
  return { line, area };
}

/** Donut arcs as [startAngle, endAngle] in radians, clockwise from 12 o'clock. */
export function donutArcs(values: number[]): [number, number][] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  let a = -Math.PI / 2;
  return values.map((v) => {
    const start = a;
    a += (v / total) * Math.PI * 2;
    return [start, a];
  });
}

/** SVG path of a donut segment between two angles. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = end - start;
  const large = sweep > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end - 1e-6), y2 = cy + r * Math.sin(end - 1e-6);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}
