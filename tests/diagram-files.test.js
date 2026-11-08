import { describe, expect, test } from "bun:test";
import { diagramFile, exportSize, bodyLook, fitLook, svgOwner } from "../mods/file-viewer/lib/diagram-files.js";

const COLORS = { background: "#101112", foreground: "#e1e2e3", muted: "#909192", raised: "#2a2b2c", surface: "#1a1b1c", border: "#3a3b3c" };
const part = (source, firstLine = 3, width = 300, height = 120) => ({ type: "mermaid", source, firstLine, layout: { width, height } });

describe("SVG の名前", () => {
  const look = bodyLook(COLORS, 800);

  test("file-viewer-cache/ に置く", () => {
    const f = diagramFile("tok-1", part("flowchart LR; A-->B"), look);
    expect(f.path).toBe(`file-viewer-cache/${f.name}`);
  });

  test("図のソースが変わると名前が変わる", () => {
    expect(diagramFile("t", part("flowchart LR; A-->B"), look).name).not.toBe(diagramFile("t", part("flowchart LR; A-->C"), look).name);
  });

  test("色が変わると名前が変わる", () => {
    const other = bodyLook({ ...COLORS, muted: "#000000" }, 800);
    expect(diagramFile("t", part("x"), look).name).not.toBe(diagramFile("t", part("x"), other).name);
  });

  test("書き出しの大きさが変わると名前が変わる", () => {
    // 本文の幅より広い図は、本文の幅に縮めて書き出す
    expect(diagramFile("t", part("x", 3, 1000), look).name).not.toBe(diagramFile("t", part("x", 3, 1000), bodyLook(COLORS, 600)).name);
  });

  test("図より上の行が変わって図の 1 行目の行番号が変わっても、名前は変わらない", () => {
    expect(diagramFile("t", part("x", 3), look).name).toBe(diagramFile("t", part("x", 40), look).name);
  });

  test("本文の幅が変わっても、本文より狭い図の名前は変わらない", () => {
    expect(diagramFile("t", part("x", 3, 300), look).name).toBe(diagramFile("t", part("x", 3, 300), bodyLook(COLORS, 600)).name);
  });

  test("拡大の窓が書く SVG も、持ち主の token は同じに読め、窓の印が分かる", () => {
    const f = diagramFile("tok-1", part("x"), look, "z1a");
    expect(svgOwner(f.name)).toEqual({ token: "tok-1", mark: "z1a" });
    expect(svgOwner(diagramFile("tok-1", part("x"), look).name)).toEqual({ token: "tok-1", mark: null });
  });
});

describe("書き出しの大きさ", () => {
  test("本文の図は、配置の大きさのまま。本文より広い図は本文の幅に縮める", () => {
    expect(exportSize({ width: 300, height: 120 }, bodyLook(COLORS, 800))).toEqual({ width: 300, height: 120 });
    expect(exportSize({ width: 1000, height: 400 }, bodyLook(COLORS, 500))).toEqual({ width: 500, height: 200 });
  });

  test("倍率で書き出す（拡大の窓・.mmd）", () => {
    expect(exportSize({ width: 300, height: 120 }, { colors: COLORS, scale: 3 })).toEqual({ width: 900, height: 360 });
  });

  test("枠に収める倍率で書き出す（.mmd の「収まる大きさ」。上限の倍率まで）", () => {
    expect(exportSize({ width: 300, height: 120 }, fitLook(COLORS, { width: 600, height: 600, max: 1 }))).toEqual({ width: 300, height: 120 });
    expect(exportSize({ width: 1000, height: 400 }, fitLook(COLORS, { width: 500, height: 600, max: 1 }))).toEqual({ width: 500, height: 200 });
    expect(exportSize({ width: 100, height: 400 }, fitLook(COLORS, { width: 500, height: 200, max: 1 }))).toEqual({ width: 50, height: 200 });
  });

  test("書き出しの大きさは整数の px で、出す大きさと同じ（引き伸ばさない）", () => {
    const f = diagramFile("t", part("x", 1, 333.3, 111.1), { colors: COLORS, scale: 1.5 });
    expect(f.exportWidth).toBe(500);
    expect(f.exportHeight).toBe(167);
    expect(f.width).toBe(500);
    expect(f.height).toBe(167);
  });
});
