import { describe, expect, test } from "bun:test";
import { resolveLink, rewriteLocalImages, splitMermaidBlocks } from "../mods/file-viewer/lib/markdown.js";

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

  test("パーセントエンコードされた相対パスは戻してから解決する", () => {
    expect(resolveLink({ from, href: "my%20docs/a%20b.md" })).toEqual({ type: "file", path: "/r/my docs/a b.md" });
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

describe("splitMermaidBlocks", () => {
  test("```mermaid の境目で文章と図に分け、図の中身の 1 行目のファイル全体での行番号を付ける", () => {
    const md = "# 見出し\n\n```mermaid\nflowchart LR\nA-->B\n```\n本文\n~~~mermaid\nsequenceDiagram\n~~~\n";
    expect(splitMermaidBlocks(md)).toEqual([
      { type: "markdown", text: "# 見出し\n" },
      { type: "mermaid", source: "flowchart LR\nA-->B", firstLine: 4, fence: "```mermaid\nflowchart LR\nA-->B\n```" },
      { type: "markdown", text: "本文" },
      { type: "mermaid", source: "sequenceDiagram", firstLine: 9, fence: "~~~mermaid\nsequenceDiagram\n~~~" },
      { type: "markdown", text: "" },
    ]);
  });

  test("ほかの言語のコードブロックの中の ```mermaid は図にしない", () => {
    const md = "````md\n```mermaid\nA\n```\n````";
    expect(splitMermaidBlocks(md)).toEqual([{ type: "markdown", text: md }]);
  });

  test("閉じていない ```mermaid は文章のまま", () => {
    expect(splitMermaidBlocks("```mermaid\nflowchart LR")).toEqual([{ type: "markdown", text: "```mermaid\nflowchart LR" }]);
  });
});
