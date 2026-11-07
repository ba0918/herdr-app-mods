import { describe, expect, test } from "bun:test";
import { ZoomSvg, DiagramOpening } from "../mods/file-viewer/lib/zoom-svg.js";
import { resizeSvg } from "../mods/file-viewer/lib/mermaid/svg.js";

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

describe("resizeSvg", () => {
  test("ルートの width と height だけを替える", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>';
    expect(resizeSvg(svg, { width: 300, height: 150 })).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>');
  });
});
