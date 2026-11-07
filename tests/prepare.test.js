import { describe, expect, test } from "bun:test";
import { startPreparation, prepareAll, layoutMermaid } from "../mods/file-viewer/lib/prepare.js";
import { rewriteImages, collectDefinitions, splitMermaidBlocks } from "../mods/file-viewer/lib/markdown.js";

// 画像・バッジ・参照形式・HTML のかたまり・<picture>（かたまりをまたぐもの、図の境目をまたぐもの）・コードブロック・図を含む文書。
const DOC = [
  "# 見出し",
  "",
  "説明の段落。`![コード](img/no.png)` と ![図][arch] と <!-- ![コメント](img/no.png) --> を含む。",
  "",
  "[![バッジ][badge]][ci] <a href=\"docs/a.md\"><img src=\"img/b.png\" alt=\"段落のバッジ\"></a>",
  "",
  "<p align=\"center\">",
  "<picture>",
  "",
  "<source srcset=\"img/dark.png\">",
  "<img src=\"img/logo.png\" alt=\"ロゴ\">",
  "</picture>",
  "</p>",
  "",
  "<div><a href=\"#top\"><img src=\"img/c.png\"></a></div>",
  "",
  "```sh",
  "![コードブロック](img/no.png)",
  "```",
  "",
  "    ![下げたコード](img/no.png)",
  "",
  "<div>",
  "<picture>",
  "",
  "```mermaid",
  "flowchart LR",
  "A-->B",
  "```",
  "",
  "<div><img src=\"img/after.png\" alt=\"図のあと\"></div>",
  "",
  "~~~mermaid",
  "flowchart TD",
  "X-->Y",
  "~~~",
  "",
  "- 項目 ![リストの画像](img/d.png)",
  "",
  "[arch]: img/arch.png",
  "[badge]: img/badge.svg",
  "[ci]: https://example.com/ci",
  "",
].join("\n");

// 今の作り（整形表示が描画の中でしていたこと）の文章の部分。
function currentParts(text) {
  const definitions = collectDefinitions(text);
  return splitMermaidBlocks(text).map((part) => (part.type === "markdown" ? { ...part, text: rewriteImages(part.text, definitions) } : part));
}

// 終わるまで advance を呼び、終わらなかった（false を返した）回数。終わらなければ途中で失敗にする。
function runToEnd(prep, budget, now) {
  for (let calls = 0; calls < 100000; calls++) if (prep.advance(budget, now)) return calls;
  throw new Error("準備が終わらない");
}

// 呼ぶたびに step ずつ進む時計。
function clock(step) {
  let t = 0;
  return () => (t += step);
}

describe("prepareAll", () => {
  test("文章の部分は、今の定義の収集・図の境目での分割・部分ごとの画像の書き換えと同じ", () => {
    const parts = prepareAll(DOC).parts;
    const expected = currentParts(DOC);
    expect(parts.map((p) => p.type)).toEqual(expected.map((p) => p.type));
    parts.forEach((part, i) => {
      if (part.type === "markdown") expect(part.text).toBe(expected[i].text);
      else expect({ source: part.source, firstLine: part.firstLine, fence: part.fence }).toEqual({ source: expected[i].source, firstLine: expected[i].firstLine, fence: expected[i].fence });
    });
  });

  test("図は配置まで済ませて結果に入る", () => {
    const diagrams = prepareAll(DOC).parts.filter((p) => p.type === "mermaid");
    expect(diagrams).toHaveLength(2);
    for (const d of diagrams) {
      expect(d.layout.nodes.length).toBe(2);
      expect(d.error).toBeUndefined();
    }
  });

  test("解析できない図は、その図だけが失敗として入り、ほかの図と文章は結果に入る", () => {
    const md = "前\n\n```mermaid\nflowchart LR\nA-->B\n```\n\n```mermaid\npie\n```\n\n```mermaid\nflowchart LR\nC-->D\n```\n\n![図](img/a.png)";
    const parts = prepareAll(md).parts;
    const diagrams = parts.filter((p) => p.type === "mermaid");
    expect(diagrams.map((d) => Boolean(d.layout))).toEqual([true, false, true]);
    expect(diagrams[1].error.message).toBe("未対応の種類: pie");
    expect(parts[parts.length - 1].text.trim()).toBe("[図](fv-image:img/a.png)");
  });

  test("図の文法エラーは、ファイル全体での行番号で出る（今の layoutOf と同じ）", () => {
    const md = "a\nb\n```mermaid\nflowchart LR\nA-->\n```";
    const diagram = prepareAll(md).parts.find((p) => p.type === "mermaid");
    expect(diagram.error).toEqual(layoutMermaid("flowchart LR\nA-->", 4).error);
    expect(diagram.error.message).toContain("行目");
  });
});

describe("startPreparation", () => {
  test("予算を 0 にして 1 単位ずつ何度にも分けて進めた結果が、一度に進めた結果と同じ", () => {
    const prep = startPreparation(DOC);
    const now = clock(1);
    expect(runToEnd(prep, 0, now)).toBeGreaterThan(20);
    expect(prep.done).toBe(true);
    expect(prep.parts).toEqual(prepareAll(DOC).parts);
  });

  test("1 回の呼び出しは予算を使い切ったところで止まり、どの呼び出しも少なくとも 1 単位は進む", () => {
    const prep = startPreparation(DOC);
    const calls = runToEnd(prep, 100, clock(30));
    // 1 単位ごとに 30 ずつ進む時計で、予算 100 なら 1 回に 4 単位まで（最初に読んだ時刻から数える）。
    const units = runToEnd(startPreparation(DOC), 0, clock(1)) + 1;
    expect(calls + 1).toBe(Math.ceil(units / 4));
  });

  test("準備する中身を text に持つ", () => {
    expect(startPreparation("# a").text).toBe("# a");
  });

  test("空の文書も 1 つの文章の部分になる", () => {
    expect(prepareAll("").parts).toEqual([{ type: "markdown", text: "" }]);
  });

  test("画像の書き換えが例外を投げたら advance から投げ、そのあとは進まない", () => {
    const prep = startPreparation("![a](b.png)", { rewriter: () => () => { throw new Error("壊れた"); } });
    expect(() => prep.advance(Infinity, clock(1))).toThrow("壊れた");
    expect(prep.failed).toBe(true);
    expect(prep.advance(Infinity, clock(1))).toBe(false);
    expect(prep.done).toBe(false);
  });
});
