import { describe, expect, test } from "bun:test";
import { readSvgRoot, rewriteSvg } from "../mods/file-viewer/lib/svg-root.js";

// 仕様の「表示の大きさで書き直す」の「書かれた大きさの読み方」と、ガイドの「SVG の大きさの決め方」（usvg の決まり）。
const size = (text) => {
  const r = readSvgRoot(text);
  return r.kind === "rewrite" ? { width: r.width, height: r.height } : r.kind;
};

describe("書かれた大きさの読み方", () => {
  test("in・cm・mm・pt・pc は 96 dpi で px に直し、単位なしと px はそのまま", () => {
    expect(size('<svg width="100mm" height="2in">').width).toBeCloseTo(377.9527, 3);
    expect(size('<svg width="100mm" height="2in">').height).toBe(192);
    expect(size('<svg width="72pt" height="1pc">')).toEqual({ width: 96, height: 16 });
    expect(size('<svg width="2.54cm" height="10">')).toEqual({ width: 96, height: 10 });
    expect(size('<svg width="24px" height="16">')).toEqual({ width: 24, height: 16 });
  });

  test("em は根の文字の大きさ倍、ex はその半分。文字の大きさは根の font-size 属性か style の font-size で、無ければ 12", () => {
    expect(size('<svg font-size="20" width="2em" height="2ex">')).toEqual({ width: 40, height: 20 });
    expect(size('<svg style="fill: red; font-size: 10px" width="2em" height="2ex">')).toEqual({ width: 20, height: 10 });
    expect(size('<svg width="2em" height="2ex">')).toEqual({ width: 24, height: 12 });
    expect(size('<svg font-size="1in" width="1em" height="1em">')).toEqual({ width: 96, height: 96 });
    expect(size('<svg font-size="150%" width="1em" height="1em">')).toEqual({ width: 18, height: 18 });
    expect(size('<svg font-size="large" width="1em" height="1em">')).toEqual({ width: 12, height: 12 });
  });

  test("width か height が無いか % で viewBox があるとき、その側は viewBox の大きさ（% はその割合）", () => {
    expect(size('<svg viewBox="0 0 120.5 60" width="100%">')).toEqual({ width: 120.5, height: 60 });
    expect(size('<svg viewBox="10,20,200,100" width="50%" height="300">')).toEqual({ width: 100, height: 300 });
    expect(size('<svg width="80" viewBox="0 0 400 200">')).toEqual({ width: 80, height: 200 });
    // 読めない値は、無いのと同じに読む（usvg は読めない属性を無いものとして扱う）。
    expect(size('<svg width="wide" height="5" viewBox="0 0 400 200">')).toEqual({ width: 400, height: 5 });
  });
});

describe("根の要素を見つける", () => {
  test("先頭の BOM・XML 宣言・コメント・処理命令・DOCTYPE・空白を飛ばし、コメントや DOCTYPE の中の <svg は拾わない", () => {
    const head = '﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- <svg width="1" height="1"> -->\n'
      + '<?xml-stylesheet href="a.css"?>\n<!DOCTYPE svg [ <!ENTITY e "<svg width=\'2\' height=\'2\'>"> ]>\n  ';
    expect(size(`${head}<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect/></svg>`)).toEqual({ width: 30, height: 40 });
  });

  test("属性の値の中の > で開始タグを終えず、改行や ' の引用符でも読む", () => {
    expect(size(`<svg data-x="a>b"\n  width='12'\n  height = "7"\n>`)).toEqual({ width: 12, height: 7 });
  });
});

describe("書き直さない SVG", () => {
  test("width か height が無いか % で、viewBox も無いときは元のまま", () => {
    expect(size('<svg width="50%" height="100">')).toBe("asis");
    expect(size('<svg height="100">')).toBe("asis");
    expect(size("<svg>")).toBe("asis");
    expect(size('<svg width="10" height="10" viewBox="0 0 0 10">')).toEqual({ width: 10, height: 10 });
    expect(size('<svg width="10" viewBox="0 0 -5 10">')).toBe("asis");
  });

  test("根が見つからない・根が svg でない・書かれた大きさが 0 以下のときは開けない", () => {
    for (const text of ["", "plain text", "<!-- <svg width='1' height='1'>", '<?xml version="1.0"?>', '<svg width="1" height="1"',
      '<html><svg width="10" height="10"></svg></html>', '<svg width="0" height="10">', '<svg width="10" height="-1">',
      '<svg viewBox="0 0 100 100" width="0%">']) {
      expect(readSvgRoot(text).kind).toBe("unopenable");
    }
    expect(readSvgRoot("<html/>").reason).toBeTruthy();
  });
});

describe("書き換えた全文", () => {
  // 書き方は固定せず、書き換えた全文を読み直した値で確かめる。
  const root = (text) => {
    const r = readSvgRoot(text);
    const attrs = Object.fromEntries(r.tag.attrs.map((a) => [a.name, a.value]));
    return { ...r, attrs, before: text.slice(0, r.tag.start), after: text.slice(r.tag.end) };
  };
  const SVG = '<?xml version="1.0"?>\n<!-- 頭 -->\n<svg xmlns="http://www.w3.org/2000/svg" id="a" width="100mm" style="fill:red" height="50mm" viewBox="0 0 100 50"><rect width="10" height="10"/></svg>\n<!-- 尾 -->';

  test("根の width・height が指定の値になり、viewBox とほかの属性と根の外の文字は変わらない", () => {
    const out = root(rewriteSvg(SVG, readSvgRoot(SVG), { width: 200, height: 100 }));
    expect(out).toMatchObject({ kind: "rewrite", width: 200, height: 100 });
    expect(out.attrs).toEqual({ xmlns: "http://www.w3.org/2000/svg", id: "a", style: "fill:red", width: "200", height: "100", viewBox: "0 0 100 50" });
    const original = root(SVG);
    expect(out.before).toBe(original.before);
    expect(out.after).toBe(original.after);
  });

  test("小さい値や細かい値の viewBox も、元の値のまま残す", () => {
    const text = '<svg width="10" height="20" viewBox="0 0 0.0001 0.00023456"/>';
    const out = root(rewriteSvg(text, readSvgRoot(text), { width: 30, height: 60 }));
    expect(out.attrs.viewBox.split(/\s+/).map(Number)).toEqual([0, 0, 0.0001, 0.00023456]);
  });

  test("viewBox が無ければ、書かれた大きさで足す", () => {
    const text = '<svg width="2in" height="1in" xmlns="http://www.w3.org/2000/svg"/>';
    const out = root(rewriteSvg(text, readSvgRoot(text), { width: 384, height: 192 }));
    expect(out.attrs.viewBox.split(/\s+/).map(Number)).toEqual([0, 0, 192, 96]);
    expect(out).toMatchObject({ width: 384, height: 192 });
    expect(out.after).toBe("");
  });

  test("タイルは、出す絵の中のその範囲を描く viewBox の切れ端になる", () => {
    const text = '<svg width="400" height="200" viewBox="0 0 400 200"/>';
    const out = root(rewriteSvg(text, readSvgRoot(text), { width: 800, height: 400, tile: { x: 400, y: 0, width: 400, height: 400 } }));
    expect(out).toMatchObject({ width: 400, height: 400 });
    expect(out.attrs.viewBox.split(/\s+/).map(Number)).toEqual([200, 0, 200, 200]);
  });

  test("タイルの切れ端は、書かれた大きさと viewBox の縦横の比が違うときの preserveAspectRatio の置き方も写す", () => {
    // 200 × 100 の枠に 100 × 100 の viewBox を、既定（xMidYMid meet）で真ん中に置く: 枠の左端は viewBox の x = -50。
    const text = '<svg width="200" height="100" viewBox="0 0 100 100"/>';
    const tile = { x: 0, y: 0, width: 100, height: 100 };
    const out = root(rewriteSvg(text, readSvgRoot(text), { width: 200, height: 100, tile }));
    expect(out.attrs.viewBox.split(/\s+/).map(Number)).toEqual([-50, 0, 100, 100]);
    const none = '<svg width="200" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"/>';
    const stretched = root(rewriteSvg(none, readSvgRoot(none), { width: 200, height: 100, tile }));
    expect(stretched.attrs.viewBox.split(/\s+/).map(Number)).toEqual([0, 0, 50, 100]);
    expect(stretched.attrs.preserveAspectRatio).toBe("none");
  });
});
