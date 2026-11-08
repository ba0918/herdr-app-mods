import { describe, expect, test } from "bun:test";
import { parseFlowchart, parseSequence } from "../mods/file-viewer/lib/mermaid/parse.js";
import { layoutFlowchart, layoutSequence, textWidth } from "../mods/file-viewer/lib/mermaid/layout.js";

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const onBorder = (p, n, tol = 1.5) => {
  const inX = p.x >= n.x - tol && p.x <= n.x + n.width + tol;
  const inY = p.y >= n.y - tol && p.y <= n.y + n.height + tol;
  const nearX = Math.abs(p.x - n.x) <= tol || Math.abs(p.x - (n.x + n.width)) <= tol;
  const nearY = Math.abs(p.y - n.y) <= tol || Math.abs(p.y - (n.y + n.height)) <= tol;
  return inX && inY && (nearX || nearY);
};
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

const SAMPLES = {
  chain: "flowchart LR; A-->B; B-->C",
  branch: "flowchart TD\nA{開始} -->|はい| B[処理 1]\nA -->|いいえ| C[処理 2]\nB --> D((終了))\nC --> D",
  subgraph: "flowchart LR\nsubgraph g [グループ]\n  B --> C\nend\nA --> B\nC --> D",
};

describe("textWidth", () => {
  // 図の SVG の字体（Yu Gothic UI）の 13 px で、実機で描いた幅（px。太さ 400 と 600 の広いほう。ガイドの「image(path) の SVG の文字」）。
  const MEASURED = [
    ["Round Start Hex Flag 0123 Yes?", 183],
    ["角丸 四角 判定 データベース", 146],
    ["WWWWWWWWWW", 125],
    ["mmmmmmmmmm", 113],
    ["MMMMMMMMMM", 118],
    ["@@@@@@@@@@", 122],
    ["iiiiiiiiii", 32],
    ["1111111111", 67],
    ["漢漢漢漢漢漢漢漢漢漢", 129],
    ["アアアアアアアアアア", 102],
  ];

  test("図の字体で描いた幅より狭く見積もらない（名前が箱からはみ出さない）", () => {
    for (const [text, px] of MEASURED) expect(textWidth(text, 13)).toBeGreaterThanOrEqual(px - 1e-6);
  });

  test("大きさに比例する", () => {
    expect(textWidth("判定 Yes?", 26)).toBeCloseTo(textWidth("判定 Yes?", 13) * 2);
  });
});

describe("layoutFlowchart", () => {
  for (const [name, src] of Object.entries(SAMPLES)) {
    test(`ノードの箱が互いに重ならない（${name}）`, () => {
      const l = layoutFlowchart(parseFlowchart(src));
      for (let i = 0; i < l.nodes.length; i++) for (let j = i + 1; j < l.nodes.length; j++) expect(overlaps(l.nodes[i], l.nodes[j])).toBe(false);
    });

    test(`辺の両端がノードの箱の縁にある（${name}）`, () => {
      const l = layoutFlowchart(parseFlowchart(src));
      const nodes = byId(l.nodes);
      for (const e of l.edges) {
        expect(onBorder(e.points[0], nodes[e.from])).toBe(true);
        expect(onBorder(e.points[e.points.length - 1], nodes[e.to])).toBe(true);
      }
    });

    test(`図の大きさがすべてのノードを含む（${name}）`, () => {
      const l = layoutFlowchart(parseFlowchart(src));
      for (const n of l.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + n.width).toBeLessThanOrEqual(l.width);
        expect(n.y + n.height).toBeLessThanOrEqual(l.height);
      }
    });
  }

  test("LR では A・B・C の x が増えていく", () => {
    const n = byId(layoutFlowchart(parseFlowchart(SAMPLES.chain)).nodes);
    expect(n.A.x).toBeLessThan(n.B.x);
    expect(n.B.x).toBeLessThan(n.C.x);
  });

  test("TD では分岐の先が下に、合流の先がさらに下に並ぶ", () => {
    const n = byId(layoutFlowchart(parseFlowchart(SAMPLES.branch)).nodes);
    expect(n.A.y).toBeLessThan(n.B.y);
    expect(n.B.y).toBeLessThan(n.D.y);
    expect(n.C.y).toBeLessThan(n.D.y);
  });

  test("subgraph の枠が中のノードを囲み、外のノードは囲まない", () => {
    const l = layoutFlowchart(parseFlowchart(SAMPLES.subgraph));
    const n = byId(l.nodes);
    const g = l.clusters.find((c) => c.id === "g");
    expect(g.title).toBe("グループ");
    const inside = (node) => node.x >= g.x && node.y >= g.y && node.x + node.width <= g.x + g.width && node.y + node.height <= g.y + g.height;
    expect(inside(n.B) && inside(n.C)).toBe(true);
    expect(inside(n.A) || inside(n.D)).toBe(false);
  });

  test("辺のラベルに位置を付ける", () => {
    const l = layoutFlowchart(parseFlowchart(SAMPLES.branch));
    const yes = l.edges.find((e) => e.label === "はい");
    expect(Number.isFinite(yes.labelX) && Number.isFinite(yes.labelY)).toBe(true);
  });
});

describe("layoutSequence", () => {
  const src = [
    "sequenceDiagram",
    "participant C as Client",
    "participant S as Server",
    "participant D as DB",
    "C->>S: request",
    "loop retry",
    "  S->>D: query",
    "  alt found",
    "    D-->>S: row",
    "  else none",
    "    D-->>S: empty",
    "  end",
    "end",
    "Note over C,S: done",
    "S-->>C: response",
  ].join("\n");

  test("参加者の列が宣言順に左から並ぶ", () => {
    const l = layoutSequence(parseSequence(src));
    const xs = l.participants.map((p) => p.x);
    expect(l.participants.map((p) => p.id)).toEqual(["C", "S", "D"]);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  test("メッセージが記述順に上から下へ並ぶ", () => {
    const l = layoutSequence(parseSequence(src));
    expect(l.messages.map((m) => m.text)).toEqual(["request", "query", "row", "empty", "response"]);
    for (let i = 1; i < l.messages.length; i++) expect(l.messages[i].y).toBeGreaterThan(l.messages[i - 1].y);
  });

  test("alt / loop の枠が中のメッセージを囲む", () => {
    const l = layoutSequence(parseSequence(src));
    const msg = Object.fromEntries(l.messages.map((m) => [m.text, m]));
    const encloses = (b, m) => b.y < m.y && m.y < b.y + b.height && b.x <= Math.min(m.x1, m.x2) && Math.max(m.x1, m.x2) <= b.x + b.width;
    const loop = l.blocks.find((b) => b.type === "loop");
    const alt = l.blocks.find((b) => b.type === "alt");
    for (const t of ["query", "row", "empty"]) expect(encloses(loop, msg[t])).toBe(true);
    for (const t of ["row", "empty"]) expect(encloses(alt, msg[t])).toBe(true);
    expect(encloses(loop, msg.request) || encloses(loop, msg.response)).toBe(false);
    expect(alt.sections.map((s) => s.label)).toEqual(["found", "none"]);
    expect(alt.sections[1].y).toBeGreaterThan(msg.row.y);
    expect(alt.sections[1].y).toBeLessThan(msg.empty.y);
  });

  test("メッセージの矢印は送り手と受け手の列を結ぶ", () => {
    const l = layoutSequence(parseSequence(src));
    const x = Object.fromEntries(l.participants.map((p) => [p.id, p.x]));
    const req = l.messages[0];
    expect([req.x1, req.x2]).toEqual([x.C, x.S]);
  });

  test("Note は対象の列の上に置く", () => {
    const l = layoutSequence(parseSequence(src));
    const x = Object.fromEntries(l.participants.map((p) => [p.id, p.x]));
    const note = l.notes[0];
    expect(note.x).toBeLessThanOrEqual(x.C);
    expect(note.x + note.width).toBeGreaterThanOrEqual(x.S);
  });

  test("図の大きさがすべての要素を含む", () => {
    const l = layoutSequence(parseSequence(src));
    for (const p of l.participants) expect(p.boxX + p.boxWidth).toBeLessThanOrEqual(l.width);
    for (const b of l.blocks) expect(b.y + b.height).toBeLessThanOrEqual(l.height);
  });

  test("先頭の参加者の長い Note と、長い自己メッセージの文字も図の左右に収まる", () => {
    const long = "とても長い注記の文章がここに入る、とても長い注記の文章がここに入る";
    const sources = [
      `sequenceDiagram\nparticipant A\nparticipant B\nNote over A: ${long}\nA->>B: hi`,
      `sequenceDiagram\nparticipant A\nparticipant B\nNote over A,B: ${long}\nNote left of A: ${long}\nNote right of B: ${long}`,
      `sequenceDiagram\nparticipant A\nA->>A: ${long}`,
      `sequenceDiagram\nparticipant A\nparticipant B\nloop ${long}\nB->>B: ${long}\nend`,
    ];
    for (const src of sources) {
      const l = layoutSequence(parseSequence(src));
      for (const n of l.notes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x + n.width).toBeLessThanOrEqual(l.width);
      }
      for (const p of l.participants) expect(p.boxX).toBeGreaterThanOrEqual(0);
      for (const b of l.blocks) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(l.width);
      }
      for (const m of l.messages.filter((m) => m.self)) {
        expect(m.textX).toBeGreaterThanOrEqual(0);
        expect(m.textX + textWidth(m.text)).toBeLessThanOrEqual(l.width);
      }
    }
  });
});

// app の mod の実行環境はスタックが浅く、縦に 40 ノードつながった flowchart の配置で、再帰がスタックを使い切って app ごと落ちた
// （ガイドの「図の配置の再帰の深さ」）。配置の再帰の深さが、図の長さによらないことを確かめる。
describe("長い図の配置の深さ", () => {
  // スタックを狭くした bun（200 KB。今の作りでは、つながりが 121 ノードの図でスタックを使い切る）で配置する。
  function layoutWithSmallStack(source) {
    const layout = new URL("../mods/file-viewer/lib/mermaid/layout.js", import.meta.url).pathname;
    const parse = new URL("../mods/file-viewer/lib/mermaid/parse.js", import.meta.url).pathname;
    const code = `
      const { parseMermaid } = await import(${JSON.stringify(parse)});
      const { layoutFlowchart } = await import(${JSON.stringify(layout)});
      const l = layoutFlowchart(parseMermaid(${JSON.stringify(source)}).diagram);
      console.log(JSON.stringify({ nodes: l.nodes.length, height: l.height }));`;
    const r = Bun.spawnSync([process.execPath, "-e", code], { env: { ...process.env, BUN_JSC_maxPerThreadStackUsage: "200000" } });
    return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString() };
  }

  test("縦に 1,000 ノードつながった flowchart も、浅いスタックで配置できる", () => {
    const src = "flowchart TD\n" + Array.from({ length: 1000 }, (_, i) => `  N${i}[段 ${i}] --> N${i + 1}[段 ${i + 1}]`).join("\n");
    const r = layoutWithSmallStack(src);
    expect(r.err).not.toContain("Maximum call stack size exceeded");
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.out).nodes).toBe(1001);
  }, 60_000);

  test("つながりが輪になっている図も、浅いスタックで配置できる", () => {
    const src = "flowchart LR\n" + Array.from({ length: 500 }, (_, i) => `  N${i} --> N${(i + 1) % 500}`).join("\n");
    const r = layoutWithSmallStack(src);
    expect(r.err).not.toContain("Maximum call stack size exceeded");
    expect(r.ok).toBe(true);
  }, 60_000);
});
