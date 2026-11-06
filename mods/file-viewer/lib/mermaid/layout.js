// 解析した Mermaid の図の、ノード・辺・参加者の位置を決める。
// flowchart は同梱の dagre（vendor/dagre.js）で層に分けて並べ、sequenceDiagram は列と行に並べる。
// 座標は図の左上を原点とした px。テキストの幅は文字数から見積もる（全角は半角の 2 倍）。
import { layout as dagreLayout, Graph } from "../../vendor/dagre.js";

export const FONT_SIZE = 13;
export const LINE_HEIGHT = 18;
const TITLE_HEIGHT = 18;

function isWide(code) {
  return (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60)
    || (code >= 0xffe0 && code <= 0xffe6) || code >= 0x1f000;
}

export function textWidth(text, size = FONT_SIZE) {
  let units = 0;
  for (const ch of text) units += isWide(ch.codePointAt(0)) ? 2 : 1;
  return units * size * 0.55;
}

export function labelLines(label) {
  return label.split(/<br\s*\/?>|\n/i);
}

function labelBox(label) {
  const lines = labelLines(label);
  return { width: Math.max(0, ...lines.map((l) => textWidth(l))), height: lines.length * LINE_HEIGHT };
}

function nodeSize(node) {
  const { width: w, height: h } = labelBox(node.label);
  switch (node.shape) {
    case "circle":
    case "double-circle": {
      const d = Math.max(w, h) + 28;
      return { width: d, height: d };
    }
    case "rhombus": return { width: w * 1.5 + 36, height: h * 1.5 + 28 };
    case "hexagon": return { width: w + 44, height: h + 18 };
    case "parallelogram":
    case "trapezoid": return { width: w + 44, height: h + 18 };
    case "stadium": return { width: w + 36, height: h + 18 };
    default: return { width: w + 28, height: h + 18 };
  }
}

// 図の要素をすべて (margin, margin) 以降に寄せ、全体の大きさを返す。
function normalize(items, margin) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const b of items.boxes) { grow(b.x, b.y); grow(b.x + b.width, b.y + b.height); }
  for (const p of items.points) grow(p.x, p.y);
  if (!Number.isFinite(minX)) return { width: margin * 2, height: margin * 2 };
  const dx = margin - minX, dy = margin - minY;
  for (const b of items.boxes) { b.x += dx; b.y += dy; }
  for (const p of items.points) { p.x += dx; p.y += dy; }
  return { width: maxX - minX + margin * 2, height: maxY - minY + margin * 2 };
}

// graph: parseFlowchart の結果。
export function layoutFlowchart(graph) {
  const g = new Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: graph.direction, nodesep: 28, ranksep: 44, edgesep: 14, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) g.setNode(node.id, nodeSize(node));
  const clusterId = (id) => `\u0000cluster:${id}`;
  // 中身のある subgraph だけを枠にする。子の subgraph しか持たないものは、その子に中身があるときだけ。
  // 中身の無い枠を dagre に渡すと、位置と大きさが決まらない（NaN になる）。
  const filled = new Set();
  for (let grew = true; grew;) {
    grew = false;
    for (const s of graph.subgraphs) {
      if (filled.has(s.id) || !(s.nodes.length || graph.subgraphs.some((c) => c.parent === s.id && filled.has(c.id)))) continue;
      filled.add(s.id);
      grew = true;
    }
  }
  const used = graph.subgraphs.filter((s) => filled.has(s.id));
  for (const s of used) g.setNode(clusterId(s.id), {});
  for (const s of used) {
    if (s.parent && used.some((p) => p.id === s.parent)) g.setParent(clusterId(s.id), clusterId(s.parent));
    for (const id of s.nodes) g.setParent(id, clusterId(s.id));
  }
  graph.edges.forEach((e, i) => {
    const box = e.label ? labelBox(e.label) : { width: 0, height: 0 };
    g.setEdge(e.from, e.to, { width: box.width + (e.label ? 8 : 0), height: box.height, labelpos: "c" }, `e${i}`);
  });
  dagreLayout(g);

  const nodes = graph.nodes.map((node) => {
    const v = g.node(node.id);
    return { ...node, x: v.x - v.width / 2, y: v.y - v.height / 2, width: v.width, height: v.height };
  });
  const edges = graph.edges.map((e, i) => {
    const v = g.edge(e.from, e.to, `e${i}`);
    return { ...e, points: v.points.map((p) => ({ x: p.x, y: p.y })), labelX: v.x, labelY: v.y };
  });
  const clusters = used.map((s) => {
    const v = g.node(clusterId(s.id));
    // 見出しの分だけ枠を上に広げる。
    return { id: s.id, title: s.title, parent: s.parent, x: v.x - v.width / 2, y: v.y - v.height / 2 - TITLE_HEIGHT, width: v.width, height: v.height + TITLE_HEIGHT };
  });
  const labels = edges.filter((e) => e.label).map((e) => ({ x: e.labelX, y: e.labelY }));
  const size = normalize({ boxes: [...nodes, ...clusters], points: [...edges.flatMap((e) => e.points), ...labels] }, 12);
  for (const e of edges) {
    const label = e.label ? labels.shift() : null;
    if (label) { e.labelX = label.x; e.labelY = label.y; }
  }
  return { type: "flowchart", ...size, nodes, edges, clusters };
}

// ---- sequenceDiagram ----

const BOX_HEIGHT = 34;
const ROW = 38;
const SELF_ROW = 52;
const NOTE_PAD = 8;
const BLOCK_HEAD = 26;
const MARGIN = 12;

function walk(items, visit, depth = 0) {
  for (const item of items) {
    visit(item, depth);
    if (item.kind === "block") for (const s of item.sections) walk(s.items, visit, depth + 1);
  }
}

// diagram: parseSequence の結果。
export function layoutSequence(diagram) {
  const order = new Map(diagram.participants.map((p, i) => [p.id, i]));
  const boxW = diagram.participants.map((p) => Math.max(textWidth(p.label) + 28, 72));

  // 列の中心: 隣の列との間は箱が重ならない幅、メッセージや Note があればその文字が収まる幅を取る。
  const need = diagram.participants.map(() => 0);
  const spans = [];
  walk(diagram.items, (item) => {
    if (item.kind === "message") {
      const a = order.get(item.from), b = order.get(item.to);
      if (a === b) need[a] = Math.max(need[a], textWidth(item.text) + 40);
      else spans.push([Math.min(a, b), Math.max(a, b), textWidth(item.text) + 36]);
    }
    if (item.kind === "note") {
      const idx = item.over.map((id) => order.get(id));
      const w = textWidth(item.text) + NOTE_PAD * 2 + 8;
      if (item.placement === "right") need[idx[0]] = Math.max(need[idx[0]], w + 10);
      else if (item.placement === "left" && idx[0] > 0) spans.push([idx[0] - 1, idx[0], w + 20]);
      else if (idx.length > 1) spans.push([Math.min(...idx), Math.max(...idx), w - 40]);
    }
  });
  const leftNeed = diagram.participants.map((_, i) => 0);
  walk(diagram.items, (item) => {
    if (item.kind === "note" && item.placement === "left" && order.get(item.over[0]) === 0) leftNeed[0] = textWidth(item.text) + NOTE_PAD * 2 + 18;
  });
  const xs = [];
  diagram.participants.forEach((_, i) => {
    if (i === 0) { xs.push(MARGIN + Math.max(boxW[0] / 2, leftNeed[0])); return; }
    let x = xs[i - 1] + Math.max((boxW[i - 1] + boxW[i]) / 2 + 24, need[i - 1]);
    for (const [a, b, w] of spans) if (b === i) x = Math.max(x, xs[a] + w);
    xs.push(x);
  });

  const participants = diagram.participants.map((p, i) => ({ ...p, x: xs[i], boxX: xs[i] - boxW[i] / 2, boxWidth: boxW[i], boxHeight: BOX_HEIGHT }));
  const messages = [], notes = [], blocks = [], activations = [];
  const open = new Map(diagram.participants.map((p) => [p.id, []]));
  let y = MARGIN + BOX_HEIGHT + 16;

  const activate = (id, at) => open.get(id).push(at);
  const deactivate = (id, at) => {
    const start = open.get(id).pop();
    if (start !== undefined) activations.push({ id, x: xs[order.get(id)], y1: start, y2: at, depth: open.get(id).length });
  };

  const place = (items, depth) => {
    const span = { min: Infinity, max: -Infinity };
    const cover = (x1, x2) => { span.min = Math.min(span.min, x1); span.max = Math.max(span.max, x2); };
    for (const item of items) {
      if (item.kind === "message") {
        const x1 = xs[order.get(item.from)], x2 = xs[order.get(item.to)];
        const self = item.from === item.to;
        const rowY = y + (self ? SELF_ROW : ROW) - 10;
        messages.push({ ...item, x1, x2, y: rowY, self });
        cover(Math.min(x1, x2) - 10, Math.max(x1, x2) + (self ? 40 : 10));
        if (item.activate) activate(item.activate, rowY);
        if (item.deactivate) deactivate(item.deactivate, rowY);
        y += self ? SELF_ROW : ROW;
      } else if (item.kind === "note") {
        const idx = item.over.map((id) => order.get(id));
        const w = textWidth(item.text) + NOTE_PAD * 2;
        const h = LINE_HEIGHT + NOTE_PAD * 2;
        let x;
        if (item.placement === "left") x = xs[idx[0]] - 12 - w;
        else if (item.placement === "right") x = xs[idx[0]] + 12;
        else {
          const lo = xs[Math.min(...idx)], hi = xs[Math.max(...idx)];
          const width = Math.max(w, hi - lo + 40);
          x = (lo + hi) / 2 - width / 2;
          notes.push({ ...item, x, y: y + 6, width, height: h });
          cover(x, x + width);
          y += h + 14;
          continue;
        }
        notes.push({ ...item, x, y: y + 6, width: w, height: h });
        cover(x, x + w);
        y += h + 14;
      } else if (item.kind === "activate") {
        activate(item.id, y);
      } else if (item.kind === "deactivate") {
        deactivate(item.id, y);
      } else if (item.kind === "block") {
        const block = { type: item.type, depth, x: 0, y, width: 0, height: 0, sections: [] };
        blocks.push(block);
        const inner = { min: Infinity, max: -Infinity };
        y += BLOCK_HEAD;
        item.sections.forEach((section, i) => {
          if (i > 0) y += 8;
          block.sections.push({ label: section.label, y: i === 0 ? block.y : y - 8 });
          if (i > 0) y += BLOCK_HEAD - 8;
          const s = place(section.items, depth + 1);
          inner.min = Math.min(inner.min, s.min);
          inner.max = Math.max(inner.max, s.max);
        });
        y += 10;
        const labelW = textWidth(`${item.type} ${item.sections[0].label}`) + 40;
        const pad = 12;
        if (!Number.isFinite(inner.min)) {
          // 中身の無い枠は参加者の列全体に、参加者もいなければ見出しの幅だけで置く。
          if (xs.length) { inner.min = xs[0] - 20; inner.max = xs[xs.length - 1] + 20; }
          else { inner.min = MARGIN + pad; inner.max = inner.min; }
        }
        block.x = inner.min - pad;
        block.width = Math.max(inner.max - inner.min + pad * 2, labelW);
        block.height = y - block.y;
        cover(block.x, block.x + block.width);
      }
    }
    return span;
  };
  place(diagram.items, 0);
  for (const [id, starts] of open) while (starts.length) deactivate(id, y);

  const bottom = y + 10;
  const footers = participants.map((p) => ({ ...p, y: bottom }));
  const boxes = [
    ...participants.map((p) => ({ x: p.boxX, y: MARGIN, width: p.boxWidth, height: BOX_HEIGHT })),
    ...footers.map((p) => ({ x: p.boxX, y: p.y, width: p.boxWidth, height: BOX_HEIGHT })),
    ...notes, ...blocks,
  ];
  const width = Math.max(100, ...boxes.map((b) => b.x + b.width), ...messages.map((m) => Math.max(m.x1, m.x2) + (m.self ? 50 : 0))) + MARGIN;
  return {
    type: "sequence", width, height: bottom + BOX_HEIGHT + MARGIN,
    participants, footerY: bottom, lifelineTop: MARGIN + BOX_HEIGHT, lifelineBottom: bottom,
    messages, notes, blocks, activations,
  };
}
