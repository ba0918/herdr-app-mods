import { describe, expect, test } from "bun:test";
import { ZoomSvg, DiagramOpening } from "../mods/file-viewer/lib/zoom-svg.js";
import { resizeSvg } from "../mods/file-viewer/lib/mermaid/svg.js";
import { ensureTable, claimInit, initPlan, initDone, bodyPlace, windowPlace, rendered, takeReleases, released } from "../mods/file-viewer/lib/seats.js";
import { SeatUser } from "../mods/file-viewer/lib/seat-user.js";

// 倍率と色から名前を決める書き出し先の代わり。
const fileAt = (task) => ({ name: `s${task.scale}-${task.colorsKey}`, path: `cache/s${task.scale}-${task.colorsKey}`, width: 100 * task.scale, height: 50 * task.scale });
const FIRST = { name: "s1-c1", path: "cache/s1-c1", scale: 1, width: 100, height: 50 };

function zoomed() {
  return new ZoomSvg({ shown: FIRST, colorsKey: "c1" });
}
// 次の書き出しを書いて、app が読み込んだことにする。
function writeNext(z, t = 0) {
  const task = z.task();
  const file = fileAt(task);
  z.wrote(task, file, t);
  z.loadedImage(file.name, t);
  return task;
}

describe("拡大の窓の倍率", () => {
  test("倍率が変わったら、書いて読み込み終えるまで前の倍率の絵をその大きさのまま出し、終えたら新しい倍率の絵を出す", () => {
    const z = zoomed();
    z.request(3);
    expect(z.display().file).toEqual(FIRST);
    const task = z.task();
    expect(task).toEqual({ scale: 3, colorsKey: "c1" });
    const file = fileAt(task);
    z.wrote(task, file, 1);
    expect(z.display().file).toEqual(FIRST);
    expect(z.preloads()).toEqual([file]);
    expect(z.loadedImage(file.name, 2)).toBe(true);
    expect(z.display().file).toEqual({ ...file, scale: 3 });
    expect(z.task()).toBe(null);
  });

  test("書いている間は次の書き出しを始めず、続けて変わったら最後の倍率だけを書く", () => {
    const z = zoomed();
    z.request(2);
    const first = z.task();
    expect(z.task()).toBe(null);
    z.request(3);
    z.request(4);
    z.wrote(first, fileAt(first), 1);
    // 書き終えた 2 倍の絵は、もう望まれていないので出さない
    expect(z.preloads()).toEqual([]);
    expect(z.task()).toEqual({ scale: 4, colorsKey: "c1" });
  });

  test("今の絵と同じ倍率に戻ったら、書かない", () => {
    const z = zoomed();
    z.request(2);
    z.request(1);
    expect(z.task()).toBe(null);
  });

  test("書き出し直しが失敗したら、前の絵のまま知らせを出し、次に書き出せたら消す", () => {
    const z = zoomed();
    z.request(2);
    z.failed(z.task(), "書けない", 1);
    expect(z.display()).toEqual({ file: FIRST, notice: { kind: "write", message: "書けない" } });
    expect(z.task()).toBe(null);
    z.request(3);
    writeNext(z, 2);
    expect(z.display().notice).toBe(null);
    expect(z.display().file.scale).toBe(3);
  });

  test("10 秒たっても書き終えなければ、前の絵のまま知らせを出す", () => {
    const z = zoomed();
    z.request(2);
    z.task();
    expect(z.watch(0)).toBe(false);
    expect(z.watch(5_000)).toBe(false);
    expect(z.watch(10_001)).toBe(true);
    expect(z.display()).toEqual({ file: FIRST, notice: { kind: "timeout" } });
  });

  test("10 秒たっても書き終えなかった書き出しは手放し、次の倍率の要求で書き出しを始め直し、書けたら知らせを消す", () => {
    const z = zoomed();
    z.request(2);
    const stuck = z.task();
    z.watch(0);
    expect(z.watch(10_001)).toBe(true);
    z.request(3);
    const next = z.task();
    expect(next).toEqual({ scale: 3, colorsKey: "c1" });
    z.wrote(stuck, fileAt(stuck));
    const file = fileAt(next);
    z.wrote(next, file);
    z.loadedImage(file.name);
    expect(z.display()).toEqual({ file: { ...file, scale: 3 }, notice: null });
  });

  test("テーマが変わったら、新しい色で書き終えるまで前の色の絵を出す", () => {
    const z = zoomed();
    z.recolor("c2");
    expect(z.task()).toEqual({ scale: 1, colorsKey: "c2" });
    expect(z.display().file).toEqual(FIRST);
  });

  test("使っている絵の名前（出している絵と、書いて読み込ませている絵）", () => {
    const z = zoomed();
    z.request(2);
    const task = z.task();
    z.wrote(task, fileAt(task), 1);
    expect([...z.keep()].sort()).toEqual(["s1-c1", "s2-c1"]);
    z.loadedImage("s2-c1", 2);
    expect([...z.keep()]).toEqual(["s2-c1"]);
  });
});

describe("拡大の窓の絵の席が無くなったとき", () => {
  // 仕様: 消えた絵の席を使っていた拡大の窓は、出していた絵をその絵の席に書き直す。
  test("出している絵と、書いて読み込みを待っている絵の、どちらの絵の席でも、その絵の倍率と色で書き直す先が分かる", () => {
    const z = zoomed();
    z.request(3);
    z.recolor("c2");
    const task = z.task();
    const file = fileAt(task);
    z.wrote(task, file, 1);
    expect(z.lostTile("s1-c1")).toEqual({ tile: FIRST, file: FIRST, scale: 1, colorsKey: "c1" });
    expect(z.lostTile(file.name)).toEqual({ tile: file, file, scale: 3, colorsKey: "c2" });
    expect(z.lostTile("s2-c1")).toBe(null);
  });
});

describe("図を押して拡大の窓を開くとき", () => {
  test("収まる大きさの絵を書いて読み込み終えたら、その絵で開く", () => {
    const o = new DiagramOpening(0);
    expect(o.decide(100)).toBe("wait");
    o.wrote();
    expect(o.decide(200)).toBe("wait");
    o.loaded();
    expect(o.decide(300)).toBe("fit");
  });

  test("1 秒たっても書き終えなければ（読み込み終えなければ）、本文の絵を本来の大きさで出して開く", () => {
    const o = new DiagramOpening(0);
    o.wrote();
    expect(o.decide(999)).toBe("wait");
    expect(o.decide(1_000)).toBe("natural");
  });

  test("書き出しが失敗したら、待たずに本文の絵で開く", () => {
    const o = new DiagramOpening(0);
    o.failed();
    expect(o.decide(10)).toBe("natural");
  });
});

// ルートの svg 要素の書き出しの大きさと viewBox。
function rootSize(svg) {
  const root = svg.match(/^<svg[^>]*>/)[0];
  const attr = (name) => root.match(new RegExp(` ${name}="([^"]*)"`))?.[1];
  return { width: attr("width"), height: attr("height"), viewBox: attr("viewBox") };
}

describe("resizeSvg", () => {
  test("ルートの width と height だけを替える", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>';
    expect(rootSize(resizeSvg(svg, { width: 300, height: 150 }))).toEqual({ width: "300", height: "150", viewBox: "0 0 100 50" });
  });
});

describe("resizeSvg のタイル", () => {
  test("view を渡すと、width と height に加えて viewBox もその範囲にする", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>';
    expect(rootSize(resizeSvg(svg, { width: 300, height: 75, view: { x: 0, y: 25, width: 100, height: 25 } }))).toEqual({ width: "300", height: "75", viewBox: "0 25 100 25" });
  });
});

describe("拡大の窓のタイルに分けた絵", () => {
  const tiledAt = (task) => {
    const base = `s${task.scale}-${task.colorsKey}`;
    const tiles = [0, 1].map((i) => ({ name: `${base}#${i}`, path: `cache/${base}#${i}`, x: 0, y: i * 50 * task.scale, width: 100 * task.scale, height: 50 * task.scale }));
    return { name: tiles[0].name, path: tiles[0].path, width: 100 * task.scale, height: 100 * task.scale, tiles };
  };

  test("どのタイルも読み込み終えるまで前の絵を出し、終えたら替える。使っている名前はタイルごと", () => {
    const z = new ZoomSvg({ shown: FIRST, colorsKey: "c1" });
    z.request(3);
    const task = z.task();
    const file = tiledAt(task);
    z.wrote(task, file);
    expect(z.preloads().map((t) => t.name)).toEqual(["s3-c1#0", "s3-c1#1"]);
    expect(z.loadedImage("s3-c1#0")).toBe(false);
    expect(z.display().file).toEqual(FIRST);
    expect([...z.keep()].sort()).toEqual(["s1-c1", "s3-c1#0", "s3-c1#1"]);
    expect(z.loadedImage("s3-c1#1")).toBe(true);
    expect(z.display().file).toEqual({ ...file, scale: 3 });
    expect([...z.keep()].sort()).toEqual(["s3-c1#0", "s3-c1#1"]);
  });
});

// 仕様の「画像の置き場所」の拡大の窓: 窓は今出している絵の席を持ち、倍率や色を替えて差し替えたら窓だけが使っていた前の絵の席を
// 手放す。本文と共有する絵の席は、本文が使わなくなっても窓が出している間は手放さない。main.js と同じく、描画のたびに窓が使っている
// 絵の席（keep）を表に渡す。
describe("拡大の窓の絵の席を手放す", () => {
  const TOK = "3f2b9c1e-8a7d-4e6f-9b0c-1d2e3f4a5b6c";
  function seats() {
    const table = ensureTable({}, 0);
    const init = { place: bodyPlace(TOK), gen: "g0" };
    claimInit(table, init, 0);
    initPlan(table, [], 16);
    initDone(table, init);
    const body = new SeatUser(table, { place: bodyPlace(TOK), gen: "g1" });
    const win = new SeatUser(table, { place: windowPlace(TOK), gen: "g2" });
    return { table, body, win };
  }
  // 窓が倍率と色の鍵で絵の席を取って書いた絵。
  const fileFrom = (user, z) => (task) => {
    const name = user.nameOf(`s${task.scale}-${task.colorsKey}`, (n) => z.fresh(n));
    user.wrote(name, { ok: true });
    return { name, path: name, width: 100 * task.scale, height: 50 * task.scale };
  };
  // 描画: 窓の使う絵の席を渡し、描画の回数を進め、手放す絵の席を手放す。
  function draw(s, user, names) {
    user.use(names);
    rendered(s.table, user.owner.place);
    const out = takeReleases(s.table, user.owner);
    released(s.table, out, user.owner);
    return out;
  }
  // タブが書いた収まる大きさの絵の席で開いた窓（タブはそれを窓の集まりに入れてから、開く前の絵から外す）。
  function opened(s) {
    const fit = s.body.nameOf("fit");
    s.body.wrote(fit, { ok: true });
    const z = new ZoomSvg({ shown: { name: fit, path: fit, scale: 1, width: 100, height: 50 }, colorsKey: "c1" });
    draw(s, s.win, z.keep());
    expect(draw(s, s.body, [])).toEqual([]);
    return { z, fit };
  }

  test("差し替えたら前の倍率の絵の席が外れて手放され、今の絵の席は外れない", () => {
    const s = seats();
    const { z, fit } = opened(s);
    z.request(2);
    const task = z.task();
    const file = fileFrom(s.win, z)(task);
    z.wrote(task, file);
    expect(draw(s, s.win, z.keep())).toEqual([]);
    z.loadedImage(file.name);
    expect(draw(s, s.win, z.keep())).toEqual([fit]);
    expect(z.keep().has(file.name)).toBe(true);
    expect(draw(s, s.win, z.keep())).toEqual([]);
  });

  test("倍率を続けて変えて途中の絵が要らなくなったら、その絵の席が窓の集まりから外れて手放される", () => {
    const s = seats();
    const { z } = opened(s);
    z.request(2);
    const t2 = z.task();
    const f2 = fileFrom(s.win, z)(t2);
    z.wrote(t2, f2);
    z.request(3);
    expect(z.keep().has(f2.name)).toBe(false);
    expect(draw(s, s.win, z.keep())).toEqual([f2.name]);
  });

  test("本文の絵の席で開いた窓では、本文がその絵の席を外しても、窓が外すまで手放さない", () => {
    const s = seats();
    const shown = s.body.nameOf("本文の図");
    s.body.wrote(shown, { ok: true });
    draw(s, s.body, [shown]);
    const z = new ZoomSvg({ shown: { name: shown, path: shown, scale: 1, width: 100, height: 50 }, colorsKey: "c1" });
    draw(s, s.win, z.keep());
    expect(draw(s, s.body, [])).toEqual([]);
    z.request(2);
    const task = z.task();
    const file = fileFrom(s.win, z)(task);
    z.wrote(task, file);
    z.loadedImage(file.name);
    expect(draw(s, s.win, z.keep())).toEqual([shown]);
  });

  test("手放した絵の席がまた窓に割り当てられたら、読み込み終えるまで差し替えない", () => {
    const s = seats();
    const { z, fit } = opened(s);
    z.request(2);
    let task = z.task();
    const f2 = fileFrom(s.win, z)(task);
    z.wrote(task, f2);
    z.loadedImage(f2.name);
    expect(draw(s, s.win, z.keep())).toEqual([fit]);
    z.request(3);
    task = z.task();
    const f3 = fileFrom(s.win, z)(task);
    expect(f3.name).toBe(fit);
    z.wrote(task, f3);
    expect(z.display().file.name).toBe(f2.name);
    z.loadedImage(f3.name);
    expect(z.display().file.name).toBe(fit);
  });
});
