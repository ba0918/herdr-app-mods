import { describe, expect, test } from "bun:test";
import { kind, TEXT_LIMIT, IMAGE_LIMIT } from "../mods/file-viewer/lib/kind.js";

const MiB = 1024 * 1024;

describe("kind", () => {
  test("拡張子の無いテキストは code で開く", () => {
    expect(kind({ path: "/r/Makefile", size: 20, text: "all:\n\techo hi\n" })).toEqual({ type: "code", source: true });
  });

  test("拡張子は大文字小文字を区別せず、SVG は image でソース表示できる", () => {
    expect(kind({ path: "/r/logo.SVG", size: 300 })).toEqual({ type: "image", source: true });
  });

  test("NUL を含むファイルは開けないファイル（バイナリ）", () => {
    expect(kind({ path: "/r/a.bin", size: 4, text: "ab\0c" })).toEqual({ type: "unopenable", reason: "binary" });
  });

  test("テキストの上限を超えたら開けないファイル（上限超え）", () => {
    expect(kind({ path: "/r/big.log", size: 2 * MiB })).toEqual({ type: "unopenable", reason: "too-large", limit: TEXT_LIMIT });
  });

  test("画像の上限を超えた PNG は開けないファイル（上限超え）", () => {
    expect(kind({ path: "/r/shot.png", size: 7_000_000 })).toEqual({ type: "unopenable", reason: "too-large", limit: IMAGE_LIMIT });
  });

  test("1 MiB を超える SVG は image で開くがソース表示は無い", () => {
    expect(kind({ path: "/r/huge.svg", size: 2 * MiB })).toEqual({ type: "image", source: false });
  });

  test("NUL を含む Markdown はバイナリ扱い", () => {
    expect(kind({ path: "/r/notes.md", size: 5, text: "# a\0" })).toEqual({ type: "unopenable", reason: "binary" });
  });

  test("Markdown と Mermaid は拡張子で決まる", () => {
    expect(kind({ path: "/r/README.markdown", size: 3, text: "# a" })).toEqual({ type: "markdown", source: true });
    expect(kind({ path: "/r/flow.mmd", size: 3, text: "graph LR" })).toEqual({ type: "mermaid", source: true });
  });

  test("上限ちょうどは開ける", () => {
    expect(kind({ path: "/r/a.txt", size: TEXT_LIMIT, text: "x" })).toEqual({ type: "code", source: true });
    expect(kind({ path: "/r/a.webp", size: IMAGE_LIMIT })).toEqual({ type: "image", source: false });
  });
});
