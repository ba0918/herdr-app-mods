import { describe, expect, test } from "bun:test";
import { diagramFile, exportSize, bodyLook, scaleLook, fitLook, maxDiagramScale, tileView, TILE_SIDE } from "../mods/file-viewer/lib/diagram-files.js";

// 名前を見た目の鍵そのものにする表の代わり（使っている絵の表は、持っている間は同じ鍵に同じ名前を返す。lib/pictures.js）。
const key = (k) => k;

const COLORS = { background: "#101112", foreground: "#e1e2e3", muted: "#909192", raised: "#2a2b2c", surface: "#1a1b1c", border: "#3a3b3c" };
const part = (source, firstLine = 3, width = 300, height = 120) => ({ type: "mermaid", source, firstLine, layout: { width, height } });

describe("SVG の名前（使っている絵の表から、見た目の鍵で取る）", () => {
  const look = bodyLook(COLORS, 800);

  test("付き添いの mod のフォルダに置く", () => {
    const f = diagramFile(() => "tok-1-000000001-0.svg", part("flowchart LR; A-->B"), look);
    expect(f.name).toBe("tok-1-000000001-0.svg");
    expect(f.path).toBe("mods/file-viewer-images/tok-1-000000001-0.svg");
  });

  test("図のソースが変わると鍵が変わる", () => {
    expect(diagramFile(key, part("flowchart LR; A-->B"), look).name).not.toBe(diagramFile(key, part("flowchart LR; A-->C"), look).name);
  });

  test("色が変わると鍵が変わる", () => {
    const other = bodyLook({ ...COLORS, muted: "#000000" }, 800);
    expect(diagramFile(key, part("x"), look).name).not.toBe(diagramFile(key, part("x"), other).name);
  });

  test("書き出しの大きさが変わると鍵が変わる", () => {
    // 本文の幅より広い図は、本文の幅に縮めて書き出す
    expect(diagramFile(key, part("x", 3, 1000), look).name).not.toBe(diagramFile(key, part("x", 3, 1000), bodyLook(COLORS, 600)).name);
  });

  test("図より上の行が変わって図の 1 行目の行番号が変わっても、鍵は変わらない", () => {
    expect(diagramFile(key, part("x", 3), look).name).toBe(diagramFile(key, part("x", 40), look).name);
  });

  test("本文の幅が変わっても、本文より狭い図の鍵は変わらない", () => {
    expect(diagramFile(key, part("x", 3, 300), look).name).toBe(diagramFile(key, part("x", 3, 300), bodyLook(COLORS, 600)).name);
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
    const f = diagramFile(key, part("x", 1, 333.3, 111.1), { colors: COLORS, scale: 1.5 });
    expect(f.exportWidth).toBe(500);
    expect(f.exportHeight).toBe(167);
    expect(f.width).toBe(500);
    expect(f.height).toBe(167);
  });
});

// 仕様の「描き方」: 画像を引き伸ばした・縮めた絵は一瞬も見せない。大きな絵は、app が 1 枚の画像としてくっきり描ける大きさ
// （ガイドの「image(path) の SVG の大きさ」）のタイルに分けて書き出す。
describe("大きな絵（引き伸ばさない）", () => {
  const tilesCover = (f) => {
    // タイルは隙間も重なりも無く、出す大きさの全体を覆う
    let area = 0;
    for (const t of f.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(f.width);
      expect(t.y + t.height).toBeLessThanOrEqual(f.height);
      area += t.width * t.height;
      for (const u of f.tiles) if (u !== t) expect(t.x < u.x + u.width && u.x < t.x + t.width && t.y < u.y + u.height && u.y < t.y + t.height).toBe(false);
    }
    expect(area).toBe(f.width * f.height);
  };

  test("本文の縦に長い図（400 × 6000）は、配置の大きさのまま書き出して出す（縮めた絵を引き伸ばさない）", () => {
    const f = diagramFile(key, part("tall", 1, 400, 6000), bodyLook(COLORS, 800));
    expect([f.width, f.height, f.exportWidth, f.exportHeight]).toEqual([400, 6000, 400, 6000]);
    tilesCover(f);
  });

  test("長い辺が 1 枚の上限を超える絵は、上限以下のタイルに分ける。どのタイルも書き出しの大きさと出す大きさが同じ", () => {
    const f = diagramFile(key, part("big", 1, 1500, 9000), scaleLook(COLORS, 1));
    expect(f.tiles.length).toBeGreaterThan(1);
    for (const t of f.tiles) {
      expect(t.width).toBeLessThanOrEqual(TILE_SIDE);
      expect(t.height).toBeLessThanOrEqual(TILE_SIDE);
    }
    tilesCover(f);
  });

  test("上限以下の絵は 1 枚", () => {
    const f = diagramFile(key, part("small"), bodyLook(COLORS, 800));
    expect(f.tiles).toEqual([{ name: f.name, path: f.path, x: 0, y: 0, width: 300, height: 120 }]);
  });

  test("タイルは 1 枚ずつ別の鍵で名前を取り、付き添いの mod のフォルダに置く", () => {
    const f = diagramFile(key, part("big", 1, 1500, 9000), scaleLook(COLORS, 1));
    expect(new Set(f.tiles.map((t) => t.name)).size).toBe(f.tiles.length);
    for (const t of f.tiles) expect(t.path).toBe(`mods/file-viewer-images/${t.name}`);
  });

  test("倍率で書き出す絵の面積には上限があり、拡大の上限の倍率はその面積に収まる倍率", () => {
    const layout = { width: 1000, height: 800 };
    const max = maxDiagramScale(layout);
    const at = exportSize(layout, { colors: COLORS, scale: max });
    expect(at.width * at.height).toBeLessThanOrEqual(16_777_216 * 1.01);
    // 上限を超える倍率を頼まれても、書き出す絵は上限の倍率まで（出す大きさも同じなので、引き伸ばさない）
    expect(exportSize(layout, { colors: COLORS, scale: max * 4 })).toEqual(at);
  });
});


describe("タイルの範囲", () => {
  test("タイルの位置と大きさを、配置の座標の範囲にする（隣のタイルと切れ目なくつながる）", () => {
    const layout = { width: 1500, height: 9000 };
    const f = diagramFile(key, { source: "big", layout }, scaleLook(COLORS, 1));
    const views = f.tiles.map((t) => tileView(f, t, layout));
    expect(views[0]).toEqual({ x: 0, y: 0, width: 1500 * (f.tiles[0].width / f.width), height: f.tiles[0].height * (9000 / f.height) });
    for (const [i, t] of f.tiles.entries()) {
      expect(views[i].x).toBeCloseTo(t.x * (1500 / f.width));
      expect(views[i].y).toBeCloseTo(t.y * (9000 / f.height));
    }
  });
});

describe("縦に長い図のある文書", () => {
  test("文書の中の縦に長い図（配置の高さが 1 枚の上限を超える）は、本文の大きさのまま、隙間のないタイルで書き出す", async () => {
    const { prepareAll } = await import("../mods/file-viewer/lib/prepare.js");
    const chain = Array.from({ length: 120 }, (_, i) => `  N${i}[段 ${i}] --> N${i + 1}[段 ${i + 1}]`).join("\n");
    const doc = `# 長い図\n\n\`\`\`mermaid\nflowchart TD\n${chain}\n\`\`\`\n`;
    const part = prepareAll(doc).parts.find((p) => p.type === "mermaid");
    expect(part.layout.height).toBeGreaterThan(TILE_SIDE);
    const f = diagramFile(key, part, bodyLook(COLORS, 900));
    expect(f.height).toBe(Math.round(part.layout.height * Math.min(1, 900 / part.layout.width)));
    expect([f.exportWidth, f.exportHeight]).toEqual([f.width, f.height]);
    expect(f.tiles.length).toBeGreaterThan(1);
    expect(f.tiles.reduce((sum, t) => sum + t.width * t.height, 0)).toBe(f.width * f.height);
    for (const t of f.tiles) expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(TILE_SIDE);
  });
});
