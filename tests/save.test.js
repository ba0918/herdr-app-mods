import { describe, expect, test } from "bun:test";
import { splitForWrite, utf8Length, argLength, preserveLineEndings, splitBom, contentToSave, looksNonUtf8 } from "../mods/file-viewer/lib/save.js";

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

  test("Windows のコマンドラインに収まるよう、1 断片を引数の長さ 24,000 以下にする（\" と \\ は 2 と数える）", () => {
    const ascii = "a".repeat(60_000);
    const quotes = '"'.repeat(30_000);
    for (const text of [ascii, quotes, "\\".repeat(30_000)]) {
      const parts = splitForWrite(text);
      expect(parts.join("")).toBe(text);
      for (const part of parts) expect(argLength(part)).toBeLessThanOrEqual(24_000);
    }
    expect(argLength('a"\\🎉')).toBe(1 + 2 + 2 + 2);
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
  const crlf8lf2 = () => {
    const lines = [];
    for (let i = 1; i <= 10; i++) lines.push(`line${i}${i === 4 || i === 7 ? "\n" : "\r\n"}`);
    return lines.join("");
  };

  test("CRLF のファイルは、Editor が LF で返しても CRLF で書き戻す", () => {
    expect(preserveLineEndings("a\r\nb\r\n", "a\nB\n")).toBe("a\r\nB\r\n");
  });

  test("LF のファイルは LF のまま", () => {
    expect(preserveLineEndings("a\nb\n", "a\nB\n")).toBe("a\nB\n");
  });

  test("Editor が CRLF のまま返しても二重にしない", () => {
    expect(preserveLineEndings("a\r\nb\r\n", "a\r\nB\r\n")).toBe("a\r\nB\r\n");
  });

  test("混ざったファイルで CRLF の 1 行目を書き換えると、LF の行は LF のまま、1 行目は CRLF", () => {
    const original = crlf8lf2();
    const edited = original.replace(/\r\n/g, "\n").replace("line1\n", "LINE1\n");
    expect(preserveLineEndings(original, edited)).toBe(original.replace("line1", "LINE1"));
  });

  test("足した行は多いほうの改行になる（LF が多ければ LF、CRLF が多ければ CRLF、同数なら LF）", () => {
    expect(preserveLineEndings("a\nb\nc\r\n", "a\nnew\nb\nc\n")).toBe("a\nnew\nb\nc\r\n");
    expect(preserveLineEndings("a\r\nb\r\nc\n", "a\nnew\nb\nc\n")).toBe("a\r\nnew\r\nb\r\nc\n");
    expect(preserveLineEndings("a\r\nb\n", "a\nnew\nb\n")).toBe("a\r\nnew\nb\n");
  });

  test("行を消しても、残った行の改行は元のまま", () => {
    expect(preserveLineEndings("a\r\nb\nc\r\nd\n", "a\nc\nd\n")).toBe("a\r\nc\r\nd\n");
  });

  test("編集後の内容の行末が \\r\\n でも \\n でも同じ結果になる", () => {
    const original = crlf8lf2();
    const lf = original.replace(/\r\n/g, "\n").replace("line5\n", "line5\nadded\n");
    const kept = original.replace("line5\r\n", "line5\r\nadded\r\n");
    expect(preserveLineEndings(original, lf)).toBe(preserveLineEndings(original, kept));
    expect(preserveLineEndings(original, lf)).toBe(kept);
  });

  test("末尾に改行の無いファイルの最後に改行を付けると、多いほうの改行で付く", () => {
    expect(preserveLineEndings("a\r\nb\r\nc", "a\nb\nc\n")).toBe("a\r\nb\r\nc\r\n");
    expect(preserveLineEndings("a\nb", "a\nb\n")).toBe("a\nb\n");
  });

  test("末尾の改行を消すと消える", () => {
    expect(preserveLineEndings("a\r\nb\r\n", "a\nb")).toBe("a\r\nb");
  });

  test("最終行を書き換えても、末尾の改行の有無は変わらない", () => {
    expect(preserveLineEndings("a\r\nb", "a\nB")).toBe("a\r\nB");
    expect(preserveLineEndings("a\r\nb\r\n", "a\nB\n")).toBe("a\r\nB\r\n");
  });

  test("同じ内容の行が並んでいても、書き換えただけなら書き換えていない行の改行は元のまま", () => {
    const original = "c\nc\r\nb\nc\nc\r\na\nc\nc\nb\nb\r\n";
    const edited = "Z0\nc\nb\nc\nc\na\nc\nZ7\nb\nb\n";
    expect(preserveLineEndings(original, edited)).toBe("Z0\nc\r\nb\nc\nc\r\na\nc\nZ7\nb\nb\r\n");
  });

  test("空の行で始まるファイルの 1 行目に書いても、書いた文字が消えない", () => {
    expect(preserveLineEndings("\nhello\n", "hi\nhello\n")).toBe("hi\nhello\n");
    expect(preserveLineEndings("\nfoo\n", "xfoo\n")).toBe("xfoo\n");
  });

  test("行の頭に書き足した行は、書き換えた行として多いほうの改行になる", () => {
    expect(preserveLineEndings("ab\r\ncd\nef\r\ngh\r\n", "ab\r\nXcd\nef\r\ngh\r\n")).toBe("ab\r\nXcd\r\nef\r\ngh\r\n");
  });

  test("空のファイルに書いた内容は LF で、末尾の改行は書いたとおり", () => {
    expect(preserveLineEndings("", "a\nb\n")).toBe("a\nb\n");
    expect(preserveLineEndings("", "a\nb")).toBe("a\nb");
  });
});

describe("BOM", () => {
  test("BOM 付きで読んだ内容は、Editor に渡す内容から BOM が外れ、書き戻す内容の先頭に BOM が付く", () => {
    const read = splitBom("\uFEFFa\r\nb\r\n");
    expect(read).toEqual({ bom: true, text: "a\r\nb\r\n" });
    expect(contentToSave({ original: read.text, edited: "a\nB\n", bom: read.bom })).toBe("\uFEFFa\r\nB\r\n");
  });

  test("BOM 無しで読んだ内容には付けない", () => {
    const read = splitBom("a\nb\n");
    expect(read).toEqual({ bom: false, text: "a\nb\n" });
    expect(contentToSave({ original: read.text, edited: "a\nB\n", bom: read.bom })).toBe("a\nB\n");
  });

  test("BOM 付きで改行の混ざったファイルで 2 行目だけを書き換えると、1 行目は LF のまま", () => {
    const read = splitBom("\uFEFFa\nb\r\nc\r\nd\r\n");
    const saved = contentToSave({ original: read.text, edited: "a\nB\nc\nd\n", bom: read.bom });
    expect(saved).toBe("\uFEFFa\nB\r\nc\r\nd\r\n");
  });
});

describe("looksNonUtf8", () => {
  test("置換文字 U+FFFD を含めば UTF-8 でない可能性がある", () => {
    expect(looksNonUtf8("abc\uFFFDdef")).toBe(true);
    expect(looksNonUtf8("普通の日本語")).toBe(false);
  });
});
