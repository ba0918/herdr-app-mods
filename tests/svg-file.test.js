import { describe, expect, test } from "bun:test";
import { startSvgPreparation, svgFileState, svgFileView, svgLook, svgSource } from "../mods/file-viewer/lib/svg-file.js";
import { imageKey } from "../mods/file-viewer/lib/seats.js";
import { diagramFile, scaleLook, fitLook, TILE_SIDE, MAX_TILES } from "../mods/file-viewer/lib/diagram-files.js";

// 仕様の「表示の大きさで書き直す」: image viewer の SVG を、.mmd と同じ作り（lib/markdown-state.js）で、ファイル全体を部分 1 つの
// 文書として書き直す。中身は { text, key }（key は同じファイルの同じ中身を見分ける鍵の元）。
const svg = (w, h, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"${extra}><rect width="1" height="1"/></svg>`;
const content = (text, key = "k1") => ({ text, key });

// 見た目の鍵ごとに別の名前を返す、使っている絵の表の代わり。
function names() {
  const map = new Map();
  return (key) => { if (!map.has(key)) map.set(key, `seat-${String(map.size).padStart(5, "0")}.img`); return map.get(key); };
}
function state(options = {}) {
  const nameOf = names();
  const s = svgFileState({ fileOf: (part, look) => diagramFile(nameOf, part, look), ...options });
  s.setLook(scaleLook(null, 1));
  return s;
}
// 準備を進め、書き、読み込んだことにする。
function finish(s, t = 1) {
  for (let i = 0; i < 10 && !s.writeTask() && s.busy; i++) s.tick(100, () => t);
  for (let task; (task = s.writeTask());) s.wrote(task.name, t);
  for (const f of s.preloads()) s.loadedImage(f.name, t);
}
const view = (s) => svgFileView(s.display());
// 開いて、するもの（準備・<style> 要素の確かめ・書き込み・読み込み）が無くなるまで進めた SVG の、出している部分。
function opened(text) {
  const s = state();
  s.open(content(text));
  for (let i = 0; i < 100 && (s.needsRun || s.busy); i++) {
    finish(s);
    if (s.needsRun) s.tick(100, () => 1);
  }
  return view(s).part;
}

describe("SVG の準備", () => {
  test("ファイル全体を部分 1 つにし、配置の大きさは書かれた大きさ", () => {
    const prep = startSvgPreparation(content(svg("100mm", 20), "鍵"));
    expect(prep.advance(100, () => 0)).toBe(true);
    expect(prep.parts.length).toBe(1);
    expect(prep.parts[0]).toMatchObject({ type: "svg", source: "鍵" });
    expect(prep.parts[0].layout.width).toBeCloseTo(377.95, 2);
    expect(prep.parts[0].layout.height).toBe(20);
  });

  test("app が描けない SVG は、理由を持つ描けない部分になる", () => {
    const prep = startSvgPreparation(content("<html/>"));
    prep.advance(100, () => 0);
    expect(prep.parts[0].layout).toBeUndefined();
    expect(prep.parts[0].error.message).toBeTruthy();
  });
});

describe("開くとき", () => {
  test("書いて読み込み終えるまで読み込み中で、済んだら書いた大きさの絵を出す", () => {
    const s = state();
    s.open(content(svg(30, 20)));
    expect(view(s)).toEqual({ kind: "loading", notices: [] });
    s.tick(100, () => 1);
    s.wrote(s.writeTask().name, 1);
    expect(view(s).kind).toBe("loading");
    finish(s);
    const v = view(s);
    expect(v.kind).toBe("picture");
    expect(v.part.file).toMatchObject({ width: 30, height: 20 });
  });
});

describe("書く大きさ", () => {
  // part: 書かれた大きさ width × height の、<style> 要素を持たない SVG の部分。zoom: image viewer のズーム（views/zoom.js の Zoom の値）。
  const part = (width, height) => ({ type: "svg", source: "k", layout: { width, height, styled: false } });
  const zoom = (z) => ({ fit: false, scale: 1, view: null, fitMax: 1, ...z });
  const written = (p, z, viewport = { width: 1280, height: 820 }) => {
    const f = diagramFile(names(), p, svgLook(z, p.layout, viewport));
    return { width: f.width, height: f.height };
  };

  test("書く大きさは、書かれた大きさ × 倍率を整数 px に丸めたもの", () => {
    expect(written(part(33.3, 20), zoom({ scale: 1.5 }))).toEqual({ width: 50, height: 30 });
    expect(written(part(32, 32), zoom({ scale: 8 }))).toEqual({ width: 256, height: 256 });
  });

  test("収まる大きさは、枠に収まる倍率（1 まで）で、枠がまだ測れなければ窓の大きさで見積もる", () => {
    expect(written(part(1000, 1000), zoom({ fit: true, view: { width: 500, height: 100 } }))).toEqual({ width: 100, height: 100 });
    expect(written(part(100, 50), zoom({ fit: true, view: { width: 5000, height: 5000 } }))).toEqual({ width: 100, height: 50 });
    expect(written(part(8000, 8000), zoom({ fit: true }), { width: 1280, height: 820 })).toEqual({ width: 820, height: 820 });
  });

  test("面積が 4,096² を超える倍率は上限の倍率に下がり、等倍（倍率 1）が上限を超える 8000 × 8000 は約 0.512 になる", () => {
    expect(written(part(2000, 2000), zoom({ scale: 4 }))).toEqual({ width: 4096, height: 4096 });
    const z = zoom({ scale: 1 });
    expect(written(part(8000, 8000), z)).toEqual({ width: 4096, height: 4096 });
    expect(z.scale).toBeCloseTo(0.512, 6);
  });

  test("中身が変わって、新しい書かれた大きさで今の倍率が上限を超えるときは、上限の倍率に下がる", () => {
    const z = zoom({ scale: 2 });
    expect(written(part(1000, 1000), z)).toEqual({ width: 2000, height: 2000 });
    expect(z.scale).toBe(2);
    expect(written(part(4000, 4000), z)).toEqual({ width: 4096, height: 4096 });
    expect(z.scale).toBeCloseTo(1.024, 6);
  });
});

describe("書く面積の上限", () => {
  const part = (width, height) => ({ type: "svg", source: "k", layout: { width, height, styled: false } });
  const zoom = (z) => ({ fit: false, scale: 1, view: null, fitMax: 1, ...z });
  const area = (f) => f.tiles.reduce((sum, t) => sum + t.width * t.height, 0);

  test("一番拡大しても、整数に丸めた書く大きさの面積（全部のタイルの合計）は 4,096² まで", () => {
    for (const [w, h] of [[1000, 800], [333.3, 111.1], [8000, 8000], [7001, 3]]) {
      const p = part(w, h);
      const f = diagramFile(names(), p, svgLook(zoom({ scale: 1000 }), p.layout, { width: 1280, height: 820 }));
      expect(f.width * f.height).toBeLessThanOrEqual(TILE_SIDE * TILE_SIDE);
      expect(area(f)).toBeLessThanOrEqual(TILE_SIDE * TILE_SIDE);
    }
  });

  test("細長い SVG も、タイルの数は上限まで", () => {
    const p = part(500_000, 4);
    const f = diagramFile(names(), p, svgLook(zoom({ scale: 1 }), p.layout, { width: 1280, height: 820 }));
    expect(f.tiles.length).toBeLessThanOrEqual(MAX_TILES);
    expect(area(f)).toBeLessThanOrEqual(TILE_SIDE * TILE_SIDE);
    const shown = opened(svg(500_000, 4)).file;
    expect(shown.tiles.length).toBe(MAX_TILES);
    expect(area(shown)).toBeLessThanOrEqual(TILE_SIDE * TILE_SIDE);
  });

  test("縦横の比が極端な SVG のあいだは倍率を下げず、書ける中身に替わったら今の倍率で書く", () => {
    const z = zoom({ scale: 2 });
    svgLook(z, { width: 1e20, height: 1 }, { width: 1280, height: 820 });
    expect(z.scale).toBe(2);
    const p = part(100, 100);
    const f = diagramFile(names(), p, svgLook(z, p.layout, { width: 1280, height: 820 }));
    expect(f).toMatchObject({ width: 200, height: 200 });
  });

  test("上限の中で短い辺が 1 px に満たないほど縦横の比が極端な SVG は、書かずに開けない案内にする", () => {
    for (const text of [svg("1e20", 1), svg(1, "1e20"), svg("1e400", 10)]) {
      const prep = startSvgPreparation(content(text));
      prep.advance(100, () => 0);
      expect(prep.parts[0].layout).toBeUndefined();
      expect(prep.parts[0].error.message).toBeTruthy();
      const s = state();
      s.open(content(text));
      s.tick(100, () => 1);
      expect(s.writeTask()).toBeNull();
      expect(view(s).kind).toBe("error");
    }
  });
});

describe("タイル", () => {
  test("辺が 4,096 を超える大きさ（8,000 × 800 を倍率 1）は、4,096 以下のタイルに分かれ、隙間なく並ぶ", () => {
    const f = diagramFile(names(), { type: "svg", source: "k", layout: { width: 8000, height: 800, styled: false } }, scaleLook(null, 1));
    expect(f).toMatchObject({ width: 8000, height: 800 });
    expect(f.tiles.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: TILE_SIDE, height: 800 },
      { x: TILE_SIDE, y: 0, width: 8000 - TILE_SIDE, height: 800 },
    ]);
    expect(new Set(f.tiles.map((t) => t.name)).size).toBe(2);
  });

  // 大きな SVG の本文（<style> 要素が全文の終わり近くにあるものと、style 属性だけのもの）。
  const filler = `<rect style="fill: red" width="1" height="1"/>`.repeat(30_000);

  // タイルは元の根を外側の svg で包むので、<style> 要素の CSS の祖先の関係（svg svg rect など）が変わり、倍率で色などが変わりうる。
  test("<style> 要素を持つ SVG はタイルに分けず、書く大きさの長い辺が 4,096 px を超えない倍率までにする", () => {
    const styled = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="800"><style>svg svg rect { fill: red }</style><rect width="1" height="1"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="800">${filler}<style>svg svg rect { fill: red }</style></svg>`,
    ];
    for (const text of styled) {
      const p = opened(text);
      expect(p.file.tiles.length).toBe(1);
      expect(p.file).toMatchObject({ width: TILE_SIDE, height: 410 });
      const z = { fit: false, scale: 1, view: null, fitMax: 1 };
      svgLook(z, p.layout, { width: 1280, height: 820 });
      expect(z.scale).toBeCloseTo(0.512, 6);
      const most = diagramFile(names(), p, svgLook({ ...z, scale: 1000 }, p.layout, { width: 1280, height: 820 }));
      expect(most.tiles.length).toBe(1);
      expect(Math.max(most.width, most.height)).toBeLessThanOrEqual(TILE_SIDE);
    }
  });

  // style 属性は書かれた要素にだけ当たり、外側の svg は何も設定しないので、包んでも当たり方は変わらない。
  test("style 属性だけを持つ SVG と CSS を持たない SVG は、8,000 × 800 を倍率 1 でタイルに分ける", () => {
    const plain = [
      svg(8000, 800),
      `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="800"><rect style="fill: red" width="1" height="1"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" style="fill: red" width="8000" height="800"><rect width="1" height="1"/></svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="800">${filler}</svg>`,
    ];
    for (const text of plain) {
      const p = opened(text);
      expect(p.file.tiles.length).toBe(2);
      const z = { fit: false, scale: 1, view: null, fitMax: 1 };
      svgLook(z, p.layout, { width: 1280, height: 820 });
      expect(z.scale).toBe(1);
    }
  });
});

describe("倍率を変えたとき", () => {
  const fit = (width, height) => fitLook(null, { width, height, max: 1 });

  test("枠の大きさが変わっても、丸めた書く大きさが同じなら書き直さない", () => {
    const s = state();
    s.setLook(fit(100.2, 100.2));
    s.open(content(svg(1000, 1000)));
    finish(s);
    const shown = view(s).part.file.name;
    s.setLook(fit(100.4, 100.3));
    expect(s.writeTask()).toBeNull();
    expect(s.busy).toBe(false);
    expect(view(s).part.file.name).toBe(shown);
  });

  test("書いている間に倍率が 2 回変わったら、書き終えたあと最後の倍率だけを書き、途中の絵は読み込ませない。待つ間は前の絵をその大きさのまま出す", () => {
    const s = state();
    s.open(content(svg(100, 100)));
    finish(s);
    s.setLook(scaleLook(null, 2));
    const middle = s.writeTask();
    expect(middle).toMatchObject({ width: 200, height: 200 });
    s.setLook(scaleLook(null, 3));
    s.wrote(middle.name, 2);
    expect(s.preloads().map((f) => f.name)).not.toContain(middle.name);
    const last = s.writeTask();
    expect(last).toMatchObject({ width: 300, height: 300 });
    expect(view(s).part.file).toMatchObject({ width: 100, height: 100 });
    s.wrote(last.name, 3);
    expect(s.preloads().map((f) => f.name)).toEqual([last.name]);
    s.loadedImage(last.name, 4);
    expect(view(s).part.file).toMatchObject({ width: 300, height: 300 });
  });

  test("書き直しの 10 秒は、表示している間の時間で数える（止めている間は数えない）", () => {
    const s = state();
    s.open(content(svg(100, 100)));
    finish(s);
    s.setLook(scaleLook(null, 2));
    s.wrote(s.writeTask().name, 1_000);
    s.watch(() => 1_000, true);
    s.pause();
    expect(s.watch(() => 60_000, false)).toBe(false);
    expect(s.watch(() => 69_000, true)).toBe(false);
    expect(s.watch(() => 78_000, true)).toBe(false);
    expect(view(s).notices).toEqual([]);
    expect(s.watch(() => 80_000, true)).toBe(true);
    expect(view(s).part.file).toMatchObject({ width: 100, height: 100 });
    expect(view(s).notices.length).toBe(1);
  });
});

describe("中身が変わったとき", () => {
  test("前の絵を出したまま新しい中身を書き、読み込み終えてから替える", () => {
    const s = state();
    s.open(content(svg(100, 100), "前"));
    finish(s);
    s.change(content(svg(50, 40), "今"));
    expect(view(s).part.source).toBe("前");
    s.tick(100, () => 2);
    s.wrote(s.writeTask().name, 2);
    expect(view(s).part.source).toBe("前");
    finish(s, 3);
    expect(view(s).part).toMatchObject({ source: "今", file: { width: 50, height: 40 } });
  });
});

describe("失敗したとき", () => {
  const clock = () => { let t = 0; const f = () => (t += 1); f.skip = (ms) => { t += ms; }; return f; };

  test("開くときの書き出しの失敗と打ち切りは、開けない案内（読み込みの失敗と理由）になる", () => {
    const s = state();
    s.open(content(svg(100, 100)));
    s.tick(100, () => 1);
    s.writeFailed(s.writeTask().name, "書けない", 2);
    expect(view(s)).toMatchObject({ kind: "error", notices: [] });
    expect(view(s).message).toContain("書けない");

    const u = state();
    const now = clock();
    u.open(content(svg(100, 100)));
    u.tick(0, now);
    u.wrote(u.writeTask().name, now());
    now.skip(10_500);
    u.tick(0, now);
    expect(view(u)).toMatchObject({ kind: "error", notices: [] });
    expect(view(u).message).toBeTruthy();
  });

  test("倍率を変えたときの書き直しの失敗と打ち切りは、前の絵のまま知らせるだけ", () => {
    const s = state();
    s.open(content(svg(100, 100)));
    finish(s);
    s.setLook(scaleLook(null, 2));
    s.writeFailed(s.writeTask().name, "書けない", 2);
    expect(view(s)).toMatchObject({ kind: "picture", part: { file: { width: 100 } }, notices: [{ kind: "restyle-write", message: "書けない" }] });
  });

  test("中身が変わったときの書き直しの失敗と打ち切りも、前の絵のまま知らせるだけで、同じ中身を書き直し続けない。次に書けたら知らせは消える", () => {
    const s = state();
    s.open(content(svg(100, 100), "前"));
    finish(s);
    const next = content(svg(50, 50), "今");
    s.change(next);
    s.tick(100, () => 2);
    s.writeFailed(s.writeTask().name, "書けない", 3);
    expect(view(s)).toMatchObject({ kind: "picture", part: { source: "前" }, notices: [{ kind: "restyle-write", message: "書けない" }] });
    s.sync(next);
    expect(s.busy).toBe(false);
    s.setLook(scaleLook(null, 2));
    finish(s, 4);
    expect(view(s)).toMatchObject({ kind: "picture", part: { source: "今", file: { width: 100 } }, notices: [] });

    const u = state();
    const now = clock();
    u.open(content(svg(100, 100), "前"));
    finish(u);
    u.change(content(svg(50, 50), "今"));
    u.tick(0, now);
    u.wrote(u.writeTask().name, now());
    now.skip(10_500);
    u.tick(0, now);
    expect(view(u)).toMatchObject({ kind: "picture", part: { source: "前" }, notices: [{ kind: "restyle-timeout" }] });
  });

  test("開けない案内を出している SVG の中身が変わって、その書き直しが失敗か打ち切りになったら、新しい理由の開けない案内を出し直す", () => {
    const s = state();
    s.open(content("<html/>", "前"));
    finish(s);
    const before = view(s).message;
    s.change(content(svg(100, 100), "今"));
    s.tick(100, () => 2);
    s.writeFailed(s.writeTask().name, "書けない", 3);
    expect(view(s)).toMatchObject({ kind: "error", notices: [] });
    expect(view(s).message).toContain("書けない");
    expect(view(s).message).not.toBe(before);

    const u = state();
    const now = clock();
    u.open(content("<html/>", "前"));
    finish(u);
    u.change(content(svg(100, 100), "今"));
    u.tick(0, now);
    u.wrote(u.writeTask().name, now());
    now.skip(10_500);
    u.tick(0, now);
    expect(view(u).kind).toBe("error");
    expect(view(u).message).not.toBe(before);
  });

  test("開けない案内を出している SVG の中身が変わったら、開くときと同じく、新しい中身を書いて読み込むまで読み込み中を出す", () => {
    const s = state();
    s.open(content(svg(100, 100), "前"));
    s.tick(100, () => 1);
    s.writeFailed(s.writeTask().name, "書けない", 2);
    expect(view(s).kind).toBe("error");
    s.change(content(svg(50, 50), "今"));
    expect(view(s)).toEqual({ kind: "loading", notices: [] });
    s.tick(100, () => 3);
    s.wrote(s.writeTask().name, 3);
    expect(view(s)).toEqual({ kind: "loading", notices: [] });
    finish(s, 4);
    expect(view(s)).toMatchObject({ kind: "picture", part: { source: "今" }, notices: [] });

    const u = state();
    u.open(content("<html/>", "前"));
    finish(u);
    expect(view(u).kind).toBe("error");
    u.change(content(svg(50, 50), "今"));
    u.tick(100, () => 2);
    expect(view(u)).toEqual({ kind: "loading", notices: [] });
    finish(u, 3);
    expect(view(u)).toMatchObject({ kind: "picture", part: { source: "今" }, notices: [] });

    // 新しい中身の準備の途中で、中身がまた変わっても読み込み中のまま。
    const w = state();
    w.open(content("<html/>", "前"));
    finish(w);
    w.change(content(svg(50, 50), "次"));
    w.tick(100, () => 2);
    w.change(content(svg(40, 40), "今"));
    expect(view(w)).toEqual({ kind: "loading", notices: [] });
    finish(w, 3);
    finish(w, 4);
    expect(view(w)).toMatchObject({ kind: "picture", part: { source: "今" }, notices: [] });
  });

  test("中身が変わって根の要素で描けないと分かる SVG になったら、開けない案内にする", () => {
    const s = state();
    s.open(content(svg(100, 100), "前"));
    finish(s);
    s.change(content("<html/>", "今"));
    finish(s);
    expect(view(s)).toMatchObject({ kind: "error", notices: [] });
    expect(view(s).message).toBeTruthy();
  });
});

describe("書き直さない SVG", () => {
  test("元のままと開けないに分けた SVG は書き直さない（元のままはズームの伸び縮みで出す）", () => {
    for (const [text, kind] of [['<svg width="50%" height="10"/>', "asis"], ["<html/>", "error"]]) {
      const s = state();
      s.open(content(text));
      s.tick(100, () => 1);
      expect(s.writeTask()).toBeNull();
      expect(s.busy).toBe(false);
      expect(view(s).kind).toBe(kind);
      expect([...s.keep()]).toEqual([]);
    }
  });
});

describe("共有の鍵", () => {
  const file = { machine: "wsl", path: "/repo/a.svg", size: 6_000_000, mtime: "2026-11-11 10:00:00", hash: "abc" };
  // 見た目で書く絵のタイルの鍵（使っている絵の表から名前を取る鍵）。
  const keys = (source, layout, look) => diagramFile((k) => k, { type: "svg", source, layout: { styled: false, ...layout } }, look).tiles.map((t) => t.key);

  test("同じファイル・同じ中身（大きさ・更新時刻）・同じ書く大きさなら同じになる", () => {
    expect(keys(svgSource(file), { width: 100, height: 100 }, scaleLook(null, 2))).toEqual(keys(svgSource({ ...file }), { width: 100, height: 100 }, scaleLook(null, 2.001)));
    expect(keys(svgSource(file), { width: 300, height: 300 }, scaleLook(null, 0.5))).toEqual(keys(svgSource(file), { width: 300, height: 300 }, fitLook(null, { width: 150, height: 999, max: 1 })));
  });

  test("ファイル・中身・書く大きさ・タイルの位置のどれかが違えば違う", () => {
    const base = keys(svgSource(file), { width: 100, height: 100 }, scaleLook(null, 2))[0];
    for (const change of [{ machine: null }, { path: "/repo/b.svg" }, { size: 1 }, { mtime: "x" }, { hash: "def" }]) {
      expect(keys(svgSource({ ...file, ...change }), { width: 100, height: 100 }, scaleLook(null, 2))[0]).not.toBe(base);
    }
    expect(keys(svgSource(file), { width: 100, height: 100 }, scaleLook(null, 3))[0]).not.toBe(base);
    const tiles = keys(svgSource(file), { width: 8000, height: 800 }, scaleLook(null, 1));
    expect(new Set(tiles).size).toBe(2);
  });

  test("図の鍵とも、元のままの画像の鍵とも重ならない", () => {
    const svgKeys = keys(svgSource(file), { width: 100, height: 100 }, scaleLook(null, 1));
    const diagram = diagramFile((k) => k, { type: "mermaid", source: svgSource(file), layout: { width: 100, height: 100 } }, scaleLook({ background: "#000" }, 1)).tiles[0].key;
    expect(svgKeys).not.toContain(diagram);
    expect(svgKeys).not.toContain(imageKey(file));
    expect(svgKeys[0].startsWith(imageKey(file))).toBe(false);
  });
});
