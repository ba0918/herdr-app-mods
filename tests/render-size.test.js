import { describe, expect, test } from "bun:test";
import { utf8Length, countDiagrams, judgeSize, PREPARE_IN_RENDER, RENDER_LIMIT } from "../mods/file-viewer/lib/render-size.js";
import { splitMermaidBlocks } from "../mods/file-viewer/lib/markdown.js";

const diagram = "```mermaid\nflowchart LR\nA-->B\n```\n";
const diagrams = (n) => diagram.repeat(n);

describe("utf8Length", () => {
  test("UTF-8 にした大きさ（日本語・4 バイトの絵文字・ASCII の混ざり）", () => {
    for (const text of ["", "abc", "日本語", "😀", "a日😀b\r\n", "é ü ß", "\u{10ffff}ࠀ߿\u0080\u007f"]) {
      expect(utf8Length(text)).toBe(Buffer.byteLength(text));
    }
  });
});

describe("countDiagrams", () => {
  const cases = {
    "ふつうの図": "前\n" + diagrams(2) + "後",
    "大文字の言語": "```MERMAID\nflowchart LR\n```\n",
    "~~~ のフェンス": "~~~mermaid\nflowchart LR\n~~~\n",
    "長いフェンスの中の ```mermaid": "````md\n```mermaid\nA\n```\n````\n",
    "4 つ下げた行はフェンスでない": "    ```mermaid\n    A\n    ```\n",
    "CRLF の行": "```mermaid\r\nflowchart LR\r\n```\r\n本文\r\n",
    "閉じていない図": "```mermaid\nflowchart LR\n",
    "閉じていないほかのブロックのあとの図": "```js\nx\n" + diagram,
    "言語のないフェンスのあとの図": "```\n```mermaid\n```\n" + diagram,
    "空": "",
  };
  for (const [name, text] of Object.entries(cases)) {
    test(`splitMermaidBlocks の図の数と同じ（${name}）`, () => {
      expect(countDiagrams(text)).toBe(splitMermaidBlocks(text).filter((p) => p.type === "mermaid").length);
    });
  }
});

describe("judgeSize", () => {
  test("文字数も図の数も、描画の外で準備する大きさ以下なら描画の中（ちょうどの値は描画の中）", () => {
    const text = diagrams(PREPARE_IN_RENDER.diagrams);
    const atLimit = text + "a".repeat(PREPARE_IN_RENDER.chars - text.length);
    expect(atLimit.length).toBe(PREPARE_IN_RENDER.chars);
    expect(judgeSize(atLimit)).toEqual({ inRender: true, over: null });
  });

  test("文字数が描画の外で準備する大きさを超えたら描画の外", () => {
    expect(judgeSize("a".repeat(PREPARE_IN_RENDER.chars + 1))).toEqual({ inRender: false, over: null });
  });

  test("図の数が描画の外で準備する大きさを超えたら描画の外", () => {
    expect(judgeSize(diagrams(PREPARE_IN_RENDER.diagrams + 1))).toEqual({ inRender: false, over: null });
  });

  test("バイト数が整形表示の上限ちょうどなら整形表示をする", () => {
    const text = "あ".repeat(Math.floor(RENDER_LIMIT.bytes / 3)) + "a".repeat(RENDER_LIMIT.bytes % 3);
    expect(Buffer.byteLength(text)).toBe(RENDER_LIMIT.bytes);
    expect(judgeSize(text).over).toBeNull();
  });

  test("バイト数が整形表示の上限を超えたら整形表示をせず、上限と今のバイト数を返す", () => {
    const text = "あ".repeat(Math.floor(RENDER_LIMIT.bytes / 3)) + "a".repeat(RENDER_LIMIT.bytes % 3) + "😀";
    expect(judgeSize(text)).toEqual({ inRender: false, over: { kind: "bytes", limit: RENDER_LIMIT.bytes, size: RENDER_LIMIT.bytes + 4 } });
  });

  test("文字数だけで上限を超える大きな文書も、今のバイト数を返す", () => {
    const text = "a日".repeat(RENDER_LIMIT.bytes);
    expect(judgeSize(text).over).toEqual({ kind: "bytes", limit: RENDER_LIMIT.bytes, size: Buffer.byteLength(text) });
  });

  test("図の数が整形表示の上限ちょうどなら整形表示をし、超えたら上限と今の図の数を返す", () => {
    expect(judgeSize(diagrams(RENDER_LIMIT.diagrams)).over).toBeNull();
    expect(judgeSize(diagrams(RENDER_LIMIT.diagrams + 1))).toEqual({ inRender: false, over: { kind: "diagrams", limit: RENDER_LIMIT.diagrams, size: RENDER_LIMIT.diagrams + 1 } });
  });
});
