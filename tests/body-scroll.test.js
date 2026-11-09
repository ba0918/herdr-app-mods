import { describe, expect, test } from "bun:test";
import { BodyScroll, BarShow } from "../mods/file-viewer/lib/body-scroll.js";

const sized = (view, content) => {
  const s = new BodyScroll();
  s.sized({ view, content });
  return s;
};

describe("BodyScroll.thumb", () => {
  test("つまみの長さは、本文の場所の高さと本文の高さの比で溝の長さを分けた長さ", () => {
    expect(sized(600, 2400).thumb(592, 40)).toBe(148);
    expect(sized(600, 1200).thumb(592, 40)).toBe(296);
  });

  test("本文が長くても、つまみは下限より短くならない", () => {
    expect(sized(600, 100000).thumb(592, 40)).toBe(40);
  });
});

describe("BarShow", () => {
  test("スクロールしたときに出て、決めた時間がたつと消える", () => {
    const bar = new BarShow(2000);
    expect(bar.shown(0)).toBe(false);
    bar.scrolled(1000);
    expect(bar.shown(1000)).toBe(true);
    expect(bar.shown(2999)).toBe(true);
    expect(bar.shown(3000)).toBe(false);
  });

  test("続けてスクロールすると、最後にスクロールしたときから数える", () => {
    const bar = new BarShow(2000);
    bar.scrolled(0);
    bar.scrolled(1500);
    expect(bar.shown(3000)).toBe(true);
    expect(bar.shown(3500)).toBe(false);
  });

  test("つまみにマウスを載せている間は、時間がたっても出たまま", () => {
    const bar = new BarShow(2000);
    bar.scrolled(0);
    bar.hover(true);
    expect(bar.shown(10000)).toBe(true);
    bar.hover(false);
    expect(bar.shown(10000)).toBe(false);
  });
});
