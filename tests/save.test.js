import { describe, expect, test } from "bun:test";
import { splitForWrite, utf8Length, preserveLineEndings, looksNonUtf8 } from "../mods/file-viewer/lib/save.js";

describe("splitForWrite", () => {
  const sample = () => {
    const line = "日本語のテキスト🎉と ASCII text、改行も含む。\n";
    let text = "";
    while (utf8Length(text) < 370_000) text += line;
    return text;
  };

  test("UTF-8 で 1 断片 100,000 バイト以下に分け、連結すると元に戻る", () => {
    const text = sample();
    const parts = splitForWrite(text);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    for (const part of parts) expect(utf8Length(part)).toBeLessThanOrEqual(100_000);
    expect(parts.join("")).toBe(text);
  });

  test("サロゲートペアの途中で切らない", () => {
    const text = "a" + "🎉".repeat(10);
    const parts = splitForWrite(text, 6);
    expect(parts.join("")).toBe(text);
    for (const part of parts) {
      expect(utf8Length(part)).toBeLessThanOrEqual(6);
      expect(/[\uD800-\uDBFF]$/.test(part)).toBe(false);
    }
  });

  test("空の内容は空の断片 1 つ", () => {
    expect(splitForWrite("")).toEqual([""]);
  });
});

describe("utf8Length", () => {
  test("UTF-8 のバイト数を自前で数える", () => {
    expect(utf8Length("a")).toBe(1);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("日")).toBe(3);
    expect(utf8Length("🎉")).toBe(4);
    expect(utf8Length("a日🎉")).toBe(new TextEncoder().encode("a日🎉").length);
  });
});

describe("preserveLineEndings", () => {
  test("CRLF のファイルは、Editor が LF で返しても CRLF で書き戻す", () => {
    expect(preserveLineEndings("a\r\nb\r\n", "a\nB\n")).toBe("a\r\nB\r\n");
  });

  test("LF のファイルは LF のまま", () => {
    expect(preserveLineEndings("a\nb\n", "a\nB\n")).toBe("a\nB\n");
  });

  test("末尾の改行が無かったファイルには付けない", () => {
    expect(preserveLineEndings("a\r\nb", "a\nB\n")).toBe("a\r\nB");
  });

  test("末尾の改行があったファイルは、Editor が落としても付け直す", () => {
    expect(preserveLineEndings("a\nb\n", "a\nB")).toBe("a\nB\n");
  });

  test("Editor が CRLF のまま返しても二重にしない", () => {
    expect(preserveLineEndings("a\r\nb\r\n", "a\r\nB\r\n")).toBe("a\r\nB\r\n");
  });
});

describe("looksNonUtf8", () => {
  test("置換文字 U+FFFD を含めば UTF-8 でない可能性がある", () => {
    expect(looksNonUtf8("abc\uFFFDdef")).toBe(true);
    expect(looksNonUtf8("普通の日本語")).toBe(false);
  });
});
