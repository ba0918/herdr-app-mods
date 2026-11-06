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
  test("全角は半角の 2 倍として文字数から見積もる", () => {
    expect(textWidth("ab", 10)).toBeCloseTo(textWidth("あ", 10));
    expect(textWidth("abcd", 10)).toBeGreaterThan(textWidth("ab", 10));
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
});
