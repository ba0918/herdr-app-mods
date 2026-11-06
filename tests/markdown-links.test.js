import { describe, expect, test } from "bun:test";
import { resolveLink, rewriteImages, collectDefinitions, splitMermaidBlocks } from "../mods/file-viewer/lib/markdown.js";

// 書き換えた Markdown の中の押せるリンク（Markdown のリンクと HTML の <a>。画像の ![..](..) は含めない）の名前と、押したときの行き先。
function linksIn(text, from = "/r/README.md") {
  const unHtml = (t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const unMd = (t) => t.replace(/\\([\\[\]])/g, "$1");
  return [...text.matchAll(/<a href="([^"]*)">([^<]*)<\/a>|(?<!!)\[((?:\\.|[^[\]\\])*)\]\((<[^>]*>|[^)\s]+)\)/g)].map((m) => {
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
    const definitions = collectDefinitions("[Arch  Map]: <img/a b.png> \"t\"");
    expect(linksIn(rewriteImages("![図][arch map]", definitions))).toEqual([{ name: "図", to: file("/r/img/a b.png") }]);
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

  // 段落の中は Markdown のリンク（部品が段落の中の <a> を押せない文字で出すため）、HTML のかたまりの中は <a>
  // （Markdown の書き方が効かないため）になっていること。
  const asParagraph = (out) => expect(out).not.toContain("<a ");
  const asHtmlBlock = (out) => expect(out).not.toContain("](");

  test("1 つのタグだけの行でない、タグで始まる行は、空行のあとでも段落として書き換える", () => {
    const badges = rewriteImages('本文\n\n<a href="https://example.com/ci"><img src="ci.svg" alt="CI"></a> <a href="docs/a.md"><img src="img/b.png" alt="B"></a>');
    asParagraph(badges);
    expect(linksIn(badges)).toEqual([{ name: "CI", to: { type: "external", url: "https://example.com/ci" } }, { name: "B", to: file("/r/docs/a.md") }]);
    const titled = rewriteImages('<img src="img/logo.png" alt="ロゴ"> My project');
    asParagraph(titled);
    expect(linksIn(titled)).toEqual([{ name: "ロゴ", to: file("/r/img/logo.png") }]);
  });

  test("<div> や <p> などのブロックのタグで始まる行は、段落の途中や見出しの直後でも HTML のかたまりにする", () => {
    for (const md of ['# 見出し\n<div align="center">\n<img src="img/a.png" alt="図">\n</div>', '本文\n<p align="center"><img src="img/a.png" alt="図"></p>']) {
      const out = rewriteImages(md);
      asHtmlBlock(out);
      expect(linksIn(out)).toEqual([{ name: "図", to: file("/r/img/a.png") }]);
    }
  });

  test("ほかのタグだけの行は、段落の続きでなければ HTML のかたまり、段落の続きなら段落にする", () => {
    for (const md of ['<span>\n<img src="img/a.png" alt="図">\n</span>', '# 見出し\n<span>\n<img src="img/a.png" alt="図">']) asHtmlBlock(rewriteImages(md));
    asParagraph(rewriteImages('本文\n<span>\n<img src="img/a.png" alt="図">'));
  });

  test("HTML のコメントのかたまりは、--> の行で終わる", () => {
    const out = rewriteImages("<!-- 図 -->\n![z](img/c.png)");
    asParagraph(out);
    expect(linksIn(out)).toEqual([{ name: "z", to: file("/r/img/c.png") }]);
  });

  test("リンクに包まれた画像は、外側のリンク先を開く 1 つのリンクになる", () => {
    expect(rewriteImages("[![図](img/a.png)](docs/a.md)")).toBe("[図](docs/a.md)");
    expect(rewriteImages('前 <a href="docs/a.md"><img src="img/a.png" alt="図"></a> 後')).toBe("前 [図](docs/a.md) 後");
    expect(rewriteImages('<div>\n<a href="docs/a.md"><img src="img/a.png" alt="図"></a>\n</div>')).toBe('<div>\n<a href="docs/a.md">図</a>\n</div>');
  });

  // リンクに包まれた画像で、リンクの記号が文字として残っていないこと。
  const noLeftoverBrackets = (line) => expect(line.replace(/(?<!!)\[(?:\\.|[^[\]\\])*\]\((?:<[^>]*>|[^)\s]+)\)/g, "")).not.toMatch(/[[\]]/);

  test("参照形式のリンクや、<img> を包む Markdown のリンクも、外側のリンク先を開く 1 つのリンクになる", () => {
    const md = '[![CI](https://img.shields.io/x.svg)][ci] [<img src="img/shot.png" alt="画面">](docs/a.md) [<img src="img/b.png">][Docs]\n\n[ci]: https://example.com/ci\n[docs]: <docs/b c.md>';
    const out = rewriteImages(md);
    noLeftoverBrackets(out.split("\n")[0]);
    expect(linksIn(out)).toEqual([
      { name: "CI", to: { type: "external", url: "https://example.com/ci" } },
      { name: "画面", to: file("/r/docs/a.md") },
      { name: "b.png", to: file("/r/docs/b c.md") },
    ]);
  });

  test("参照形式の外側のリンクが #見出し だけなら画像を開き、定義が無ければ中の画像だけを押せる名前にする", () => {
    const out = rewriteImages("[![図](img/a.png)][top]\n\n[top]: #top");
    noLeftoverBrackets(out.split("\n")[0]);
    expect(linksIn(out)).toEqual([{ name: "図", to: file("/r/img/a.png") }]);
    expect(linksIn(rewriteImages("[![図](img/a.png)][nothing]"))).toEqual([{ name: "図", to: file("/r/img/a.png") }]);
  });

  // HTML のかたまりの中の <a> の、押したときの行き先。
  const anchorsIn = (text) => [...text.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => resolveLink({ from: "/r/README.md", href: m[1].replace(/&amp;/g, "&") }));

  test("HTML のかたまりで、行をまたいで <a href> に包まれた画像は、外側の 1 つのリンクの中の名前になる", () => {
    const logo = rewriteImages('<p align="center">\n  <a href="https://example.com">\n    <img src="logo.png" alt="Logo">\n    <br>Example\n  </a>\n</p>');
    expect(anchorsIn(logo)).toEqual([{ type: "external", url: "https://example.com" }]);
    expect(logo).not.toContain("<img");
    expect(logo).toContain("Logo");
    const two = rewriteImages('<div>\n<a href="docs/a.md">\n<img src="img/a.png" alt="A"> <img src="img/b.png" alt="B">\n</a>\n</div>');
    expect(anchorsIn(two)).toEqual([file("/r/docs/a.md")]);
    expect(two).not.toContain("<img");
    for (const name of ["A", "B"]) expect(two).toContain(name);
  });

  test("HTML のかたまりで、行をまたいだ外側のリンクが #見出し だけなら、画像を開く", () => {
    const out = rewriteImages('<div>\n<a href="#top">\n  <img src="img/a.png" alt="図">\n</a>\n</div>');
    expect(anchorsIn(out)).toEqual([file("/r/img/a.png")]);
    expect(out).toContain("図");
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

  // コードの中を書き換えていなければ、押せるリンクは z の画像だけになる。
  const onlyZ = (md) => expect(linksIn(rewriteImages(md)).map((l) => l.name)).toEqual(["z"]);

  test("コードブロックは、開いた並びと同じ文字で、同じ長さ以上の、後ろに何も無い並びでだけ閉じる", () => {
    onlyZ("````md\n```\n![x](a.png)\n```\n````\n![z](c.png)");
    onlyZ("```\ncode\n```js\n![x](a.png)\n```\n![z](c.png)");
    onlyZ("~~~\n```\n![x](a.png)\n~~~\n![z](c.png)");
    onlyZ("```\r\n![x](a.png)\r\n```\r\n![z](c.png)");
  });

  test("空行のあとや文書の先頭の、4 つ以上の空白で下げた行はコードブロックで、書き換えない", () => {
    onlyZ("    ![x](a.png)\n\n![z](c.png)");
    onlyZ("本文\n\n    ![x](a.png)\n\n    ![y](b.png)\n![z](c.png)");
    onlyZ("# 見出し\n    ![x](a.png)\n![z](c.png)");
  });

  test("段落の続きやリストの中の、下げた行はコードブロックではない", () => {
    expect(linksIn(rewriteImages("本文\n    ![x](a.png)")).map((l) => l.name)).toEqual(["x"]);
    expect(linksIn(rewriteImages("- 項目\n\n    ![x](a.png)\n\n    - ![y](b.png)")).map((l) => l.name)).toEqual(["x", "y"]);
  });

  test("インラインコードは、段落の中なら改行をまたいでも書き換えない", () => {
    onlyZ("前 `![x](a.png)\n![y](b.png)` 後 ![z](c.png)");
  });

  test("コードブロックの中の定義は、閉じ方や下げた書き方でも集めない", () => {
    expect(linksIn(rewriteImages("````\n```\n[x]: a.png\n```\n````\n\n    [y]: b.png\n\n![x] ![y]"))).toEqual([]);
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

  test("<img> の属性に Unicode の範囲を超える数値の文字参照があっても、画像は押せる名前になる", () => {
    for (const alt of ["&#x110000;", "&#99999999999;"]) {
      const [link] = linksIn(rewriteImages(`前 <img alt="${alt}" src="a.png"> 後`));
      expect(link.to).toEqual(file("/r/a.png"));
    }
  });

  test("参照先に対になった括弧を含む画像は、括弧を含めた参照先を開く", () => {
    expect(linksIn(rewriteImages("前 ![a](https://example.com/a_(1).png) 後"))).toEqual([{ name: "a", to: { type: "external", url: "https://example.com/a_(1).png" } }]);
    expect(linksIn(rewriteImages("前 ![b](img/b_(2).png) 後"))).toEqual([{ name: "b", to: file("/r/img/b_(2).png") }]);
    expect(linksIn(rewriteImages("[![c](img/c.png)](docs/c_(3).md)"))).toEqual([{ name: "c", to: file("/r/docs/c_(3).md") }]);
  });

  test("ファイル名に # や ? を含むローカル画像は、そのファイルを開く。<> で包まない参照先の # 以降は除く", () => {
    const md = "![a](img/C%23.png) ![b](<img/C#.png>) ![c](<img/Q?.png>) ![d](img/d.png#x) ![e] <img src=\"img/C%23.png\" alt=\"f\">\n\n[e]: <img/E#.png>";
    expect(linksIn(rewriteImages(md))).toEqual([
      { name: "a", to: file("/r/img/C#.png") },
      { name: "b", to: file("/r/img/C#.png") },
      { name: "c", to: file("/r/img/Q?.png") },
      { name: "d", to: file("/r/img/d.png") },
      { name: "e", to: file("/r/img/E#.png") },
      { name: "f", to: file("/r/img/C#.png") },
    ]);
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
