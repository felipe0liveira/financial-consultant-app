import { areaPath, donutArcs } from "../geometry";

test("area path spans the width", () => {
  const { line, area } = areaPath([0, 50, 100], 200, 100);
  expect(line.startsWith("M0.0,100.0")).toBe(true);
  expect(line.endsWith("L200.0,0.0")).toBe(true);
  expect(area.endsWith("Z")).toBe(true);
});
test("donut arcs cover a full turn", () => {
  const arcs = donutArcs([1, 1, 2]);
  expect(arcs).toHaveLength(3);
  expect(arcs[2][1] - arcs[0][0]).toBeCloseTo(Math.PI * 2);
  expect(donutArcs([0, 0])).toEqual([]);
});
