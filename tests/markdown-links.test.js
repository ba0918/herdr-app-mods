import { describe, expect, test } from "bun:test";
import { resolveLink, rewriteImages, collectDefinitions, splitMermaidBlocks } from "../mods/file-viewer/lib/markdown.js";

// 書き換えた Markdown の中の押せるリンク（Markdown のリンクと HTML の <a>）の名前と、押したときの行き先。
function linksIn(text, from = "/r/README.md") {
  const unHtml = (t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const unMd = (t) => t.replace(/\\([\\[\]])/g, "$1");
  return [...text.matchAll(/<a href="([^"]*)">([^<]*)<\/a>|\[((?:\\.|[^\]\\])*)\]\((<[^>]*>|[^)\s]+)\)/g)].map((m) => {
    const href = m[1] !== undefined ? unHtml(m[1]) : m[4].replace(/^<(.*)>$/, "$1");
    return { name: m[1] !== undefined ? unHtml(m[2]) : unMd(m[3]), to: resolveLink({ from, href }) };
  });
}
const file = (path) => ({ type: "file", path });

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
    const md = rewriteImages("![構成図](img/arch.png)");
    const href = md.match(/\]\(([^)]+)\)/)[1];
    expect(resolveLink({ from, href })).toEqual({ type: "file", path: "/r/img/arch.png" });
  });

  test("パーセントエンコードされたローカル画像のパスも、元のファイル名に解決する", () => {
    for (const [src, path] of [["img/my%20photo.png", "/r/img/my photo.png"], ["img/100%.png", "/r/img/100%.png"], ["<my img/a (1).png>", "/r/my img/a (1).png"]]) {
      const md = rewriteImages(`![photo](${src})`);
      const href = md.match(/\]\((.+)\)$/)[1];
      expect(resolveLink({ from, href })).toEqual({ type: "file", path });
    }
  });
});

describe("rewriteImages", () => {
  test("ローカル画像は代替テキストを名前にしたリンクにする", () => {
    expect(rewriteImages("前 ![構成図](img/arch.png) 後")).toBe("前 [構成図](fv-image:img/arch.png) 後");
  });

  test("代替テキストが無ければファイル名をリンクの名前にする", () => {
    expect(rewriteImages("![](img/arch.png)")).toBe("[arch.png](fv-image:img/arch.png)");
  });

  test("空白や括弧を含むパスはエンコードし、タイトルは落とす", () => {
    expect(rewriteImages('![a](<my img/a (1).png> "t")')).toBe("[a](fv-image:my%20img/a%20%281%29.png)");
  });

  test("参照形式の画像は、インライン形式と同じ押せる名前になり、定義の行と同じ定義を使う普通のリンクは残る", () => {
    const md = "![図][arch] ![arch][] ![arch]\n\n[ダウンロード][arch]\n\n[arch]: img/a.png";
    expect(rewriteImages(md)).toBe("[図](fv-image:img/a.png) [arch](fv-image:img/a.png) [arch](fv-image:img/a.png)\n\n[ダウンロード][arch]\n\n[arch]: img/a.png");
  });

  test("定義の無い参照形式の画像は書き換えない", () => {
    expect(rewriteImages("![図][nothing]")).toBe("![図][nothing]");
  });

  test("定義が ```mermaid のブロックより後ろにあっても、前の部分の参照形式が解決される", () => {
    const md = "![図][arch]\n\n```mermaid\nflowchart LR\nA-->B\n```\n\n[arch]: img/a.png\n";
    const definitions = collectDefinitions(md);
    const parts = splitMermaidBlocks(md).filter((p) => p.type === "markdown").map((p) => rewriteImages(p.text, definitions));
    expect(parts[0]).toBe("[図](fv-image:img/a.png)\n");
  });

  test("コードブロックの中の定義は集めない", () => {
    expect(collectDefinitions("```\n[arch]: img/a.png\n```").size).toBe(0);
    expect(collectDefinitions("[Arch  Map]: <img/a b.png> \"t\"").get("arch map")).toBe("img/a b.png");
  });

  test("段落の中の <img> は押せる名前（alt、無ければファイル名）。属性の順番と引用符によらない", () => {
    expect(rewriteImages('前 <img src="img/a.png" alt="図"> 後')).toBe("前 [図](fv-image:img/a.png) 後");
    expect(rewriteImages("前 <img alt='図' src=img/a.png /> 後")).toBe("前 [図](fv-image:img/a.png) 後");
    expect(rewriteImages('前 <img src="img/a.png"> 後')).toBe("前 [a.png](fv-image:img/a.png) 後");
  });

  test("HTML のかたまりの中の <img> は、押せる <a> になる", () => {
    expect(rewriteImages('<p>\n<img src="img/a.png" alt="図">\n</p>')).toBe('<p>\n<a href="fv-image:img/a.png">図</a>\n</p>');
    expect(rewriteImages('本文\n\n<p align="center"><img src="img/a.png" alt="A &amp; B"></p>')).toBe('本文\n\n<p align="center"><a href="fv-image:img/a.png">A &amp; B</a></p>');
  });

  test("リンクに包まれた画像は、外側のリンク先を開く 1 つのリンクになる", () => {
    expect(rewriteImages("[![図](img/a.png)](docs/a.md)")).toBe("[図](docs/a.md)");
    expect(rewriteImages('前 <a href="docs/a.md"><img src="img/a.png" alt="図"></a> 後')).toBe("前 [図](docs/a.md) 後");
    expect(rewriteImages('<div>\n<a href="docs/a.md"><img src="img/a.png" alt="図"></a>\n</div>')).toBe('<div>\n<a href="docs/a.md">図</a>\n</div>');
  });

  test("外側のリンクが同じファイル内の #見出し だけなら、画像を開く", () => {
    expect(rewriteImages("[![図](img/a.png)](#top)")).toBe("[図](fv-image:img/a.png)");
    expect(rewriteImages('<div>\n<a href="#top"><img src="img/a.png" alt="図"></a>\n</div>')).toBe('<div>\n<a href="fv-image:img/a.png">図</a>\n</div>');
  });

  test("http(s) の画像は（部品が描けないので）名前になり、行き先は URL そのもの", () => {
    expect(rewriteImages("![logo](https://example.com/logo.png)")).toBe("[logo](https://example.com/logo.png)");
    expect(rewriteImages('前 <img src="https://example.com/i/logo.png?v=2"> 後')).toBe("前 [logo.png](https://example.com/i/logo.png?v=2) 後");
  });

  test("HTML のかたまりの中の http(s) の <img> は押せる <a> になり、<a href> に包まれていれば外側のリンク先になる", () => {
    expect(rewriteImages('<div>\n<img src="https://example.com/logo.png" alt="ロゴ">\n</div>')).toBe('<div>\n<a href="https://example.com/logo.png">ロゴ</a>\n</div>');
    expect(rewriteImages('<div>\n<a href="https://example.com"><img src="https://example.com/logo.png" alt="ロゴ"></a>\n</div>')).toBe('<div>\n<a href="https://example.com">ロゴ</a>\n</div>');
  });

  test("data: の画像はそのまま", () => {
    for (const md of ["![d](data:image/png;base64,AAAA)", '<img src="data:image/png;base64,AAAA" alt="d">']) expect(rewriteImages(md)).toBe(md);
  });

  test("コードブロック・インラインコード・<!-- --> の中は書き換えない", () => {
    const md = "```md\n![x](a.png)\n```\n`![y](b.png)` ![z](c.png)\n<!-- ![c](d.png)\n<img src=\"e.png\"> -->\n後 <!-- <img src=\"f.png\"> --> ![g](g.png)";
    expect(rewriteImages(md)).toBe("```md\n![x](a.png)\n```\n`![y](b.png)` [z](fv-image:c.png)\n<!-- ![c](d.png)\n<img src=\"e.png\"> -->\n後 <!-- <img src=\"f.png\"> --> [g](fv-image:g.png)");
  });

  // <picture> の中は押せない文字になる（文言は仕様が任せている）。押せるリンクが無く、名前と場所が出ることだけを見る。
  const unclickable = (text) => {
    expect(text).not.toContain("<img");
    expect(text).not.toContain("<a ");
    expect(text).not.toContain("](");
  };

  test("<picture> の中の <source> と style 属性の background-image は書き換えず、<img> は押せない名前と場所になる", () => {
    const md = '<picture><source srcset="a.webp" type="image/webp"><img src="a.png" alt="A"></picture>\n\n<div style="background-image: url(bg.png)">x</div>';
    const [picture, blank, div] = rewriteImages(md).split("\n");
    expect(picture.startsWith('<picture><source srcset="a.webp" type="image/webp">')).toBe(true);
    expect(picture.endsWith("</picture>")).toBe(true);
    const inside = picture.slice('<picture><source srcset="a.webp" type="image/webp">'.length, -"</picture>".length);
    unclickable(inside);
    expect(inside).toContain("A");
    expect(inside).toContain("a.png");
    expect([blank, div]).toEqual(["", '<div style="background-image: url(bg.png)">x</div>']);
  });

  test("<picture> の中の <img> は（部品が <a> を押せるリンクにしないので）押せない名前と場所になる。行をまたいでも同じ", () => {
    const md = '<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="d.png">\n  <img alt="ロゴ" src="img/logo.png">\n</picture>\n\n<p>\n<img src="img/a.png" alt="図">\n</p>';
    const lines = rewriteImages(md).split("\n");
    expect(lines.slice(0, 2)).toEqual(["<picture>", '  <source media="(prefers-color-scheme: dark)" srcset="d.png">']);
    unclickable(lines[2]);
    expect(lines[2]).toContain("ロゴ");
    expect(lines[2]).toContain("img/logo.png");
    expect(lines.slice(3, 6)).toEqual(["</picture>", "", "<p>"]);
    expect(linksIn(lines[6])).toEqual([{ name: "図", to: file("/r/img/a.png") }]);
  });

  test("![仕様](spec.pdf) を押した行き先は spec.pdf", () => {
    const md = rewriteImages("![仕様](spec.pdf)");
    const href = md.match(/\]\(([^)]+)\)/)[1];
    expect(resolveLink({ from: "/r/README.md", href })).toEqual({ type: "file", path: "/r/spec.pdf" });
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
