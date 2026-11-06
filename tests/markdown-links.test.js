import { describe, expect, test } from "bun:test";
import { resolveLink, rewriteLocalImages } from "../mods/file-viewer/lib/markdown.js";

describe("resolveLink", () => {
  const from = "/r/README.md";

  test("相対パスは Markdown ファイルのフォルダを基準に解決する", () => {
    expect(resolveLink({ from, href: "docs/design.md" })).toEqual({ type: "file", path: "/r/docs/design.md" });
    expect(resolveLink({ from: "/r/docs/a.md", href: "../img/x.png" })).toEqual({ type: "file", path: "/r/img/x.png" });
    expect(resolveLink({ from: "/r/docs/a.md", href: "./b.md" })).toEqual({ type: "file", path: "/r/docs/b.md" });
  });

  test("#見出し が付いていれば # 以降を除いてファイルを開く", () => {
    expect(resolveLink({ from, href: "docs/guide.md#使い方" })).toEqual({ type: "file", path: "/r/docs/guide.md" });
  });

  test("同じファイル内の #見出し だけのリンクは何もしない", () => {
    expect(resolveLink({ from, href: "#概要" })).toEqual({ type: "none" });
  });

  test("http(s) のリンクはブラウザ行き", () => {
    expect(resolveLink({ from, href: "https://example.com/a" })).toEqual({ type: "external", url: "https://example.com/a" });
    expect(resolveLink({ from, href: "HTTP://example.com" })).toEqual({ type: "external", url: "HTTP://example.com" });
  });

  test("http(s) 以外のスキームは開かない", () => {
    expect(resolveLink({ from, href: "mailto:a@example.com" })).toEqual({ type: "none" });
  });

  test("パーセントエンコードされた相対パスは戻してから解決する", () => {
    expect(resolveLink({ from, href: "my%20docs/a%20b.md" })).toEqual({ type: "file", path: "/r/my docs/a b.md" });
  });

  test("絶対パスはそのまま開く", () => {
    expect(resolveLink({ from, href: "/etc/hosts" })).toEqual({ type: "file", path: "/etc/hosts" });
  });

  test("Windows のパスの Markdown からは \\ で連結する", () => {
    expect(resolveLink({ from: "C:\\w\\README.md", href: "docs/a.md" })).toEqual({ type: "file", path: "C:\\w\\docs\\a.md" });
  });

  test("ローカル画像の差し替えリンクは画像のパスに解決する", () => {
    const md = rewriteLocalImages("![構成図](img/arch.png)");
    const href = md.match(/\]\(([^)]+)\)/)[1];
    expect(resolveLink({ from, href })).toEqual({ type: "file", path: "/r/img/arch.png" });
  });
});

describe("rewriteLocalImages", () => {
  test("ローカル画像は代替テキストを名前にしたリンクにする", () => {
    expect(rewriteLocalImages("前 ![構成図](img/arch.png) 後")).toBe("前 [構成図](fv-image:img/arch.png) 後");
  });

  test("代替テキストが無ければファイル名をリンクの名前にする", () => {
    expect(rewriteLocalImages("![](img/arch.png)")).toBe("[arch.png](fv-image:img/arch.png)");
  });

  test("http(s) の画像はそのまま", () => {
    const md = "![logo](https://example.com/logo.png)";
    expect(rewriteLocalImages(md)).toBe(md);
  });

  test("空白や括弧を含むパスはエンコードし、タイトルは落とす", () => {
    expect(rewriteLocalImages('![a](<my img/a (1).png> "t")')).toBe("[a](fv-image:my%20img/a%20%281%29.png)");
  });

  test("コードブロックとインラインコードの中は書き換えない", () => {
    const md = "```md\n![x](a.png)\n```\n`![y](b.png)` ![z](c.png)";
    expect(rewriteLocalImages(md)).toBe("```md\n![x](a.png)\n```\n`![y](b.png)` [z](fv-image:c.png)");
  });
});
