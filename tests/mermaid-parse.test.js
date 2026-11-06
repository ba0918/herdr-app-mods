import { describe, expect, test } from "bun:test";
import { parseFlowchart, parseSequence, mermaidError, parseMermaid } from "../mods/file-viewer/lib/mermaid/parse.js";

const ids = (list) => list.map((x) => x.id);
const edge = (e) => `${e.from}${e.kind === "arrow" ? "-->" : e.kind === "line" ? "---" : e.kind === "dotted" ? "-.->" : "==>"}${e.to}${e.label ? `|${e.label}|` : ""}`;

describe("parseFlowchart", () => {
  test("1 行に ; で並べた flowchart をノードと辺にする", () => {
    const g = parseFlowchart("flowchart LR; A-->B; B-->C");
    expect(g.direction).toBe("LR");
    expect(ids(g.nodes)).toEqual(["A", "B", "C"]);
    expect(g.edges.map(edge)).toEqual(["A-->B", "B-->C"]);
  });

  test("向きは TD / TB / BT / LR / RL、graph も flowchart と同じ。省略時は TB", () => {
    for (const d of ["TD", "TB", "BT", "LR", "RL"]) expect(parseFlowchart(`graph ${d}\nA-->B`).direction).toBe(d === "TD" ? "TB" : d);
    expect(parseFlowchart("flowchart\nA-->B").direction).toBe("TB");
  });

  test("主なノードの形と文字を読む", () => {
    const g = parseFlowchart([
      "flowchart TD",
      "a[四角] --> b(角丸)",
      "c((円)) --> d{ひし形}",
      "e[/平行四辺形/] --> f([スタジアム])",
      "g[[サブルーチン]] --> h[(円柱)]",
      "i{{六角形}} --> j>旗]",
      'k["引用 (括弧) 入り"]',
    ].join("\n"));
    const shape = Object.fromEntries(g.nodes.map((n) => [n.id, [n.shape, n.label]]));
    expect(shape).toEqual({
      a: ["rect", "四角"], b: ["round", "角丸"], c: ["circle", "円"], d: ["rhombus", "ひし形"],
      e: ["parallelogram", "平行四辺形"], f: ["stadium", "スタジアム"], g: ["subroutine", "サブルーチン"],
      h: ["cylinder", "円柱"], i: ["hexagon", "六角形"], j: ["flag", "旗"], k: ["rect", "引用 (括弧) 入り"],
    });
  });

  test("形を書かないノードは id を文字にした四角。後から形を書けば上書きする", () => {
    const g = parseFlowchart("flowchart LR\nA-->B\nB{判定}");
    expect(g.nodes.map((n) => [n.id, n.shape, n.label])).toEqual([["A", "rect", "A"], ["B", "rhombus", "判定"]]);
  });

  test("4 種の矢印とラベル（|...| と -- ... --> の両方）を読む", () => {
    const g = parseFlowchart([
      "flowchart LR",
      "A --> B", "A --- C", "A -.-> D", "A ==> E",
      "B -->|はい| F", "C -- いいえ --> G", "D -. 点線 .-> H", "E == 太線 ==> I", "F --->|長い| G",
    ].join("\n"));
    expect(g.edges.map(edge)).toEqual(["A-->B", "A---C", "A-.->D", "A==>E", "B-->F|はい|", "C-->G|いいえ|", "D-.->H|点線|", "E==>I|太線|", "F-->G|長い|"]);
  });

  test("A --> B --> C の連鎖と & を読む", () => {
    const g = parseFlowchart("flowchart LR\nA --> B --> C\nD & E --> F");
    expect(g.edges.map(edge)).toEqual(["A-->B", "B-->C", "D-->F", "E-->F"]);
  });

  test("subgraph の入れ子を読む（id と見出し、中のノード）", () => {
    const g = parseFlowchart([
      "flowchart TB",
      "subgraph outer [外側]",
      "  a --> b",
      "  subgraph inner",
      "    c",
      "  end",
      "end",
      "b --> c",
    ].join("\n"));
    expect(g.subgraphs.map((s) => [s.id, s.title, s.nodes, s.parent])).toEqual([
      ["outer", "外側", ["a", "b"], null],
      ["inner", "inner", ["c"], "outer"],
    ]);
  });

  test("style / classDef / class / ::: の色をノードに反映する", () => {
    const g = parseFlowchart([
      "flowchart LR",
      "A --> B --> C:::warn",
      "classDef hot fill:#f96,stroke:#333,stroke-width:2px,color:#fff",
      "classDef warn fill:#ff0",
      "class A,B hot",
      "style B fill:#0f0",
    ].join("\n"));
    const style = Object.fromEntries(g.nodes.map((n) => [n.id, n.style]));
    expect(style.A).toEqual({ fill: "#f96", stroke: "#333", strokeWidth: 2, color: "#fff" });
    expect(style.B).toEqual({ fill: "#0f0", stroke: "#333", strokeWidth: 2, color: "#fff" });
    expect(style.C).toEqual({ fill: "#ff0" });
  });

  test("%% のコメントと空行は読み飛ばす", () => {
    const g = parseFlowchart("flowchart LR\n%% コメント\n\nA-->B %% 行末のコメント");
    expect(g.edges.map(edge)).toEqual(["A-->B"]);
  });
});

describe("parseSequence", () => {
  test("participant / actor / as を宣言順に、出てきた参加者はその後に並べる", () => {
    const d = parseSequence([
      "sequenceDiagram",
      "participant A as Alice",
      "actor B as Bob",
      "participant C",
      "A->>D: hi",
    ].join("\n"));
    expect(d.participants).toEqual([
      { id: "A", label: "Alice", actor: false }, { id: "B", label: "Bob", actor: true },
      { id: "C", label: "C", actor: false }, { id: "D", label: "D", actor: false },
    ]);
  });

  test("6 種の矢印とメッセージを読む", () => {
    const d = parseSequence("sequenceDiagram\nA->>B: 1\nA-->>B: 2\nA->B: 3\nA-->B: 4\nA-xB: 5\nA--xB: 6");
    expect(d.items.map((m) => [m.from, m.to, m.line, m.head, m.text])).toEqual([
      ["A", "B", "solid", "arrow", "1"], ["A", "B", "dotted", "arrow", "2"],
      ["A", "B", "solid", "open", "3"], ["A", "B", "dotted", "open", "4"],
      ["A", "B", "solid", "cross", "5"], ["A", "B", "dotted", "cross", "6"],
    ]);
  });

  test("Note の left of / right of / over（2 人にまたがるものも）を読む", () => {
    const d = parseSequence("sequenceDiagram\nA->>B: x\nNote left of A: 左\nNote right of B: 右\nNote over A,B: 両方");
    expect(d.items.slice(1).map((n) => [n.kind, n.placement, n.over, n.text])).toEqual([
      ["note", "left", ["A"], "左"], ["note", "right", ["B"], "右"], ["note", "over", ["A", "B"], "両方"],
    ]);
  });

  test("alt / else / opt / loop の枠と中のメッセージを読む", () => {
    const d = parseSequence([
      "sequenceDiagram",
      "loop 毎分",
      "  A->>B: ping",
      "  alt 成功",
      "    B-->>A: pong",
      "  else 失敗",
      "    B--xA: error",
      "  end",
      "end",
      "opt 任意",
      "  A->>B: bye",
      "end",
    ].join("\n"));
    const [loop, opt] = d.items;
    expect([loop.kind, loop.type, loop.sections[0].label]).toEqual(["block", "loop", "毎分"]);
    const alt = loop.sections[0].items[1];
    expect([alt.type, alt.sections.map((s) => [s.label, s.items.map((m) => m.text)])]).toEqual(["alt", [["成功", ["pong"]], ["失敗", ["error"]]]]);
    expect([opt.type, opt.sections[0].items[0].text]).toEqual(["opt", "bye"]);
  });

  test("activate / deactivate と +/- の記法を読む", () => {
    const d = parseSequence("sequenceDiagram\nA->>+B: req\nB-->>-A: res\nactivate A\ndeactivate A");
    expect(d.items.map((i) => i.kind === "message" ? [i.kind, i.activate ?? null, i.deactivate ?? null] : [i.kind, i.id])).toEqual([
      ["message", "B", null], ["message", null, "B"], ["activate", "A"], ["deactivate", "A"],
    ]);
  });
});

describe("mermaidError", () => {
  test("未対応の種類は種類名を返す", () => {
    expect(mermaidError("classDiagram\n  A <|-- B", 1)).toEqual({ kind: "unsupported-type", message: "未対応の種類: classDiagram" });
  });

  test("範囲外の書き方はファイル全体の行番号つきで返す", () => {
    expect(mermaidError("flowchart LR\nA-->B\nclick A href", 41)).toEqual({ kind: "unsupported-syntax", message: "未対応の書き方: click（43 行目）" });
    expect(mermaidError("sequenceDiagram\nautonumber\nA->>B: x", 10)).toEqual({ kind: "unsupported-syntax", message: "未対応の書き方: autonumber（11 行目）" });
    expect(mermaidError("sequenceDiagram\npar a\nA->>B: x\nend", 1).message).toBe("未対応の書き方: par（2 行目）");
  });

  test("文法エラーはブロックの開始行から数えたファイル全体の行番号を返す", () => {
    expect(mermaidError("flowchart LR\nA-->B\nA-->", 41)).toEqual({ kind: "syntax", message: "43 行目の文法エラー" });
    expect(mermaidError("sequenceDiagram\nA->>B hi", 1)).toEqual({ kind: "syntax", message: "2 行目の文法エラー" });
    expect(mermaidError("flowchart LR\nsubgraph s\nA", 5)).toEqual({ kind: "syntax", message: "7 行目の文法エラー" });
  });

  test("描ける図は null", () => {
    expect(mermaidError("flowchart LR; A-->B", 1)).toBeNull();
    expect(parseMermaid("sequenceDiagram\nA->>B: x", 1).diagram.type).toBe("sequence");
  });
});
