import { describe, expect, test } from "bun:test";
import { isUtf8Base64, utf8Checker } from "../mods/file-viewer/lib/utf8.js";

// バイト列を、exec で運ぶときと同じ base64 にして判定する。
const check = (bytes) => isUtf8Base64(Buffer.from(bytes).toString("base64"));
const encode = (text) => [...new TextEncoder().encode(text)];

describe("isUtf8Base64", () => {
  test("正しい UTF-8 のバイト列（ASCII、日本語、4 バイトの絵文字）は正しい", () => {
    expect(check(encode("plain ASCII\n"))).toBe(true);
    expect(check(encode("日本語のテキスト"))).toBe(true);
    expect(check(encode("絵文字 🎉 と 𠮷"))).toBe(true);
    expect(check([])).toBe(true);
  });

  test("U+FFFD を表す正しい列 EF BF BD を含むバイト列は正しい", () => {
    expect(check([0x61, 0xef, 0xbf, 0xbd, 0x62])).toBe(true);
  });

  test("不正な列（FF、冗長な表現 C0 80、サロゲートの範囲 ED A0 80）は正しくない", () => {
    expect(check([0x61, 0xff, 0x62])).toBe(false);
    expect(check([0xc0, 0x80])).toBe(false);
    expect(check([0xe0, 0x80, 0x80])).toBe(false);
    expect(check([0xed, 0xa0, 0x80])).toBe(false);
    expect(check([0xf4, 0x90, 0x80, 0x80])).toBe(false);
    expect(check([0x80])).toBe(false);
  });

  test("途中で切れた列（E3 81）は正しくない", () => {
    expect(check([0x61, 0xe3, 0x81])).toBe(false);
    expect(check([0xe3, 0x81, 0x61])).toBe(false);
  });

  test("base64 として読めない文字列は「確かめられなかった」（null）", () => {
    expect(isUtf8Base64("YWJj*ZGVm")).toBe(null);
    expect(isUtf8Base64("YWJjZ")).toBe(null);
  });
});

describe("utf8Checker", () => {
  test("base64 を任意の位置で分けて渡しても、まとめて渡したときと同じ結果になる", () => {
    const samples = [encode("日本語と🎉の\uFFFDテキスト"), [0x61, 0xe3, 0x81], [0xed, 0xa0, 0x80, 0x61], encode("abc")];
    for (const bytes of samples) {
      const text = Buffer.from(bytes).toString("base64");
      for (let size = 1; size <= 5; size++) {
        const checker = utf8Checker();
        for (let i = 0; i < text.length; i += size) checker.feed(text.slice(i, i + size));
        expect(checker.result()).toBe(isUtf8Base64(text));
      }
    }
  });
});
