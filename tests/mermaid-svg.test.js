import { describe, expect, test } from "bun:test";
import { parseFlowchart, parseSequence } from "../mods/file-viewer/lib/mermaid/parse.js";
import { layoutFlowchart, layoutSequence } from "../mods/file-viewer/lib/mermaid/layout.js";
import { diagramSvg, diagramColors } from "../mods/file-viewer/lib/mermaid/svg.js";

const THEME = {
  background: "#101112", foreground: "#e1e2e3", muted: "#909192", raised: "#2a2b2c", surface: "#1a1b1c", border: "#3a3b3cff",
  accent: "#ff0000", hover: "#00ff00",
};
const COLORS = diagramColors(THEME);

// SVG を要素の組（<g data-<種類>="<名前>">…</g>）ごとに分ける。
function groups(svg, kind) {
  const out = new Map();
  for (const m of svg.matchAll(new RegExp(`<g data-${kind}="([^"]*)">(.*?)</g>`, "gs"))) out.set(m[1], m[2]);
  return out;
}
const texts = (body) => [...body.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const count = (body, tag) => (body.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;

const FLOW = `flowchart TD
  A[四角 Rect] --> B(角丸)
  B --> C([スタジアム])
  C --> D{判定}
  D -->|はい| E[[サブルーチン]]
  D -.->|いいえ| F[(データベース)]
  E ==> G((円))
  F --- H{{六角形}}
  G --> I[/平行四辺形/]
  H --> J[/台形\\]
  I --> K>旗]
  J --> L(((二重)))
  subgraph S [グループの題名]
    K --> M[中 &amp; <b>]
  end
  style A fill:#2f6f3f,stroke:#9fe0a0,color:#ffffff
  classDef warm fill:#7a3b1d,stroke:#f0a060,color:#ffe0c0
  class D,K warm`;

const SEQ = `sequenceDiagram
  participant U as 利用者
  actor A as 管理者
  participant V as viewer
  U->>V: 開く
  activate V
  V->>V: 整える
  V-->>U: 中身
  Note over U,V: 注記の文
  alt 大きい
    V-xU: 失敗
  else ふつう
    V->>A: 知らせる
  end
  opt 画像
    A->>U: 見る
  end
  loop 2 秒ごと
    U->V: 確かめる
  end
  deactivate V`;

const flow = () => layoutFlowchart(parseFlowchart(FLOW));
const seq = () => layoutSequence(parseSequence(SEQ));
const size = (l) => ({ width: l.width, height: l.height });

describe("flowchart の SVG", () => {
  test("どのノードにも形の要素と名前の text がある", () => {
    const l = flow();
    const nodes = groups(diagramSvg(l, COLORS, size(l)), "node");
    expect(nodes.size).toBe(l.nodes.length);
    for (const n of l.nodes) {
      const body = nodes.get(n.id);
      expect(count(body, "rect") + count(body, "polygon")).toBeGreaterThanOrEqual(1);
      expect(texts(body).join("")).toBe(n.label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }
  });

  test("ひし形・六角形などはその形の多角形、丸い形は角を丸めた四角になる", () => {
    const l = flow();
    const nodes = groups(diagramSvg(l, COLORS, size(l)), "node");
    for (const id of ["D", "H", "I", "J", "K"]) expect(count(nodes.get(id), "polygon")).toBe(1);
    expect(nodes.get("G")).toMatch(/<rect [^>]*rx="(\d+(\.\d+)?)"/);
    expect(count(nodes.get("L"), "rect")).toBe(2); // 二重の円
    expect(count(nodes.get("E"), "line")).toBe(2); // サブルーチンの内側の縦線
  });

  test("どの辺にも線と矢じりがあり、ラベルのある辺はラベルの text がある", () => {
    const l = flow();
    const edges = groups(diagramSvg(l, COLORS, size(l)), "edge");
    expect(edges.size).toBe(l.edges.length);
    l.edges.forEach((e, i) => {
      const body = edges.get(String(i));
      expect(count(body, "polyline")).toBe(1);
      expect(count(body, "polygon")).toBe(e.kind === "line" ? 0 : 1);
      if (e.label) expect(texts(body)).toEqual([e.label]);
    });
  });

  test("点線の辺は破線、太線の辺は太い線になる", () => {
    const l = flow();
    const edges = groups(diagramSvg(l, COLORS, size(l)), "edge");
    const line = (kind) => edges.get(String(l.edges.findIndex((e) => e.kind === kind))).match(/<polyline [^>]*>/)[0];
    expect(line("dotted")).toContain("stroke-dasharray");
    expect(line("arrow")).not.toContain("stroke-dasharray");
    const width = (s) => Number(s.match(/stroke-width="([\d.]+)"/)[1]);
    expect(width(line("thick"))).toBeGreaterThan(width(line("arrow")));
  });

  test("subgraph には枠と題名の text がある", () => {
    const l = flow();
    const clusters = groups(diagramSvg(l, COLORS, size(l)), "cluster");
    expect(clusters.size).toBe(1);
    const body = clusters.get("S");
    expect(count(body, "rect")).toBe(1);
    expect(texts(body)).toEqual(["グループの題名"]);
  });

  test("線・文字・枠にテーマの色が入る", () => {
    const l = flow();
    const svg = diagramSvg(l, COLORS, size(l));
    const edge = groups(svg, "edge").get("0");
    expect(edge).toContain('stroke="#909192"');
    expect(groups(svg, "node").get("B")).toMatch(/<text [^>]*fill="#e1e2e3"/);
    expect(groups(svg, "node").get("B")).toMatch(/<rect [^>]*fill="#2a2b2c"[^>]*stroke="#909192"/);
    // 不透明度のある色は、色と不透明度に分けて書く
    expect(groups(svg, "cluster").get("S")).toMatch(/stroke="#3a3b3c"/);
    expect(svg).not.toContain("#ff0000");
  });

  test("style・classDef・class の色がそのノードに入る", () => {
    const l = flow();
    const nodes = groups(diagramSvg(l, COLORS, size(l)), "node");
    expect(nodes.get("A")).toMatch(/<rect [^>]*fill="#2f6f3f"[^>]*stroke="#9fe0a0"/);
    expect(nodes.get("A")).toMatch(/<text [^>]*fill="#ffffff"/);
    for (const id of ["D", "K"]) {
      expect(nodes.get(id)).toMatch(/<polygon [^>]*fill="#7a3b1d"[^>]*stroke="#f0a060"/);
      expect(nodes.get(id)).toMatch(/<text [^>]*fill="#ffe0c0"/);
    }
  });
});

describe("sequenceDiagram の SVG", () => {
  test("参加者の箱と名前が上と下にあり、生存線がある", () => {
    const l = seq();
    const ps = groups(diagramSvg(l, COLORS, size(l)), "participant");
    expect(ps.size).toBe(3);
    for (const p of l.participants) {
      const body = ps.get(p.id);
      expect(count(body, "rect")).toBe(2);
      expect(texts(body)).toEqual([p.label, p.label]);
      expect(count(body, "line")).toBe(1);
    }
  });

  test("活性化の箱がある", () => {
    const l = seq();
    expect(groups(diagramSvg(l, COLORS, size(l)), "activation").size).toBe(l.activations.length);
    expect(l.activations.length).toBeGreaterThan(0);
  });

  test("メッセージには線と矢じりと文字がある（自分への矢印、失敗の印を含む）", () => {
    const l = seq();
    const ms = groups(diagramSvg(l, COLORS, size(l)), "message");
    expect(ms.size).toBe(l.messages.length);
    l.messages.forEach((m, i) => {
      const body = ms.get(String(i));
      expect(count(body, "polyline")).toBe(1);
      expect(texts(body)).toEqual([m.text]);
      if (m.head === "arrow") expect(count(body, "polygon")).toBe(1);
      if (m.head === "cross") expect(count(body, "line")).toBe(2);
    });
    expect(l.messages.some((m) => m.self)).toBe(true);
    expect(l.messages.some((m) => m.head === "cross")).toBe(true);
    expect(ms.get(String(l.messages.findIndex((m) => m.line === "dotted")))).toContain("stroke-dasharray");
  });

  test("注記と、alt・else・opt・loop の枠と見出しがある", () => {
    const l = seq();
    const svg = diagramSvg(l, COLORS, size(l));
    const notes = groups(svg, "note");
    expect(notes.size).toBe(1);
    expect(texts(notes.get("0"))).toEqual(["注記の文"]);
    const blocks = [...groups(svg, "block").values()];
    expect(blocks.length).toBe(3);
    const heads = blocks.flatMap(texts);
    for (const word of ["alt", "else", "opt", "loop"]) expect(heads.some((h) => h.startsWith(word))).toBe(true);
    for (const b of blocks) expect(count(b, "rect")).toBe(1);
  });

  test("参加者の名前は太字", () => {
    const l = seq();
    const ps = groups(diagramSvg(l, COLORS, size(l)), "participant");
    expect(ps.get("U")).toMatch(/<text [^>]*font-weight="600"/);
  });
});

describe("書き出しの大きさ", () => {
  test("大きさを変えても、width と height だけが変わり、絵の中身と viewBox は同じ", () => {
    for (const l of [flow(), seq()]) {
      const a = diagramSvg(l, COLORS, { width: l.width / 2, height: l.height / 2 });
      const b = diagramSvg(l, COLORS, { width: l.width * 3, height: l.height * 3 });
      const head = (s) => s.match(/^<svg [^>]*>/)[0];
      expect(a.slice(head(a).length)).toBe(b.slice(head(b).length));
      const attr = (s, name) => head(s).match(new RegExp(` ${name}="([^"]*)"`))[1];
      expect(attr(a, "viewBox")).toBe(attr(b, "viewBox"));
      expect(Number(attr(b, "width")) / Number(attr(a, "width"))).toBeCloseTo(6, 1);
      expect(Number(attr(b, "height")) / Number(attr(a, "height"))).toBeCloseTo(6, 1);
    }
  });
});

describe("diagramColors", () => {
  test("図に使う色だけを取り出す", () => {
    expect(diagramColors(THEME)).toEqual({
      background: "#101112", foreground: "#e1e2e3", muted: "#909192", raised: "#2a2b2c", surface: "#1a1b1c", border: "#3a3b3cff",
    });
  });
});

describe("タイルの書き出し", () => {
  test("view を渡すと、同じ絵のその範囲だけを viewBox にした SVG になる（中身は同じ）", () => {
    const l = flow();
    const whole = diagramSvg(l, COLORS, { width: l.width, height: l.height });
    const tile = diagramSvg(l, COLORS, { width: 100, height: 50, view: { x: 10, y: 20, width: 100, height: 50 } });
    expect(tile).toMatch(/^<svg [^>]*width="100" height="50" viewBox="10 20 100 50"/);
    const body = (s) => s.slice(s.indexOf(">") + 1);
    expect(body(tile)).toBe(body(whole));
  });
});
