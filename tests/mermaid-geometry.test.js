import { describe, expect, test } from "bun:test";
import { shapeAnchor } from "../mods/file-viewer/lib/mermaid/geometry.js";

const box = (shape) => ({ shape, x: 0, y: 0, width: 100, height: 60 });

describe("shapeAnchor", () => {
  test("四角はそのまま（箱の縁が形の縁）", () => {
    expect(shapeAnchor(box("rect"), { x: 100, y: 30 })).toEqual({ x: 100, y: 30 });
  });

  test("ひし形は、箱の縁の点と中心を結ぶ線と、ひし形の縁の交点に寄せる", () => {
    const p = shapeAnchor(box("rhombus"), { x: 100, y: 30 });
    expect(p.x).toBeCloseTo(100);
    const q = shapeAnchor(box("rhombus"), { x: 100, y: 0 });
    // (100,0) から中心 (50,30) へ向かう線とひし形の縁 |x-50|/50 + |y-30|/30 = 1 の交点
    expect(Math.abs(q.x - 50) / 50 + Math.abs(q.y - 30) / 30).toBeCloseTo(1);
  });

  test("円は中心からの距離が半径になる点に寄せる", () => {
    const n = { shape: "circle", x: 0, y: 0, width: 60, height: 60 };
    const p = shapeAnchor(n, { x: 60, y: 0 });
    expect(Math.hypot(p.x - 30, p.y - 30)).toBeCloseTo(30);
  });
});
