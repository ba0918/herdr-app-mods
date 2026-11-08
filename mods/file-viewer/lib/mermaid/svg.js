// 配置した図（lib/mermaid/layout.js の layout）を、1 枚の SVG の文字列にする（仕様の「描き方」）。
// 描く中身は、部品で描いていたときの図と同じ（箱・線・矢じり・文字・色）。色はテーマの色を書き込むので、テーマが変わったら書き直す。
// width / height は書き出しの大きさ、viewBox は配置の大きさにするので、大きさだけを変えれば同じ絵を書き出せる。
// 要素は、ノード・辺・参加者などのまとまりごとに <g data-<種類>="<名前>"> に入れる。
import { labelLines, textWidth, LINE_HEIGHT, FONT_SIZE } from "./layout.js";
import { shapeAnchor } from "./geometry.js";

// SVG の中の文字の字体。app の UI の字体（Geist）は SVG では使えないので、いちばん近いものにする。英字の字体を先に並べると、
// 日本語を混ぜた文字が別の等幅のような字体で描かれる（ガイドの「image(path) の SVG の文字」）。
const FONT = "Yu Gothic UI, sans-serif";

// 図に使うテーマの色の名前。
const COLOR_NAMES = ["background", "foreground", "muted", "raised", "surface", "border"];

// テーマ（herdr の theme()）から、図に使う色だけを取り出す。
export function diagramColors(t) {
  return Object.fromEntries(COLOR_NAMES.map((name) => [name, t[name]]));
}

// XML 1.0 で使えない文字（制御文字、U+FFFE・U+FFFF、対になっていないサロゲート）。u フラグなので、対のサロゲートは 1 文字として当たらない。
// 残すと SVG が XML として不正になり、app が読めないので U+FFFD に替える。
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/gu;
const esc = (s) => String(s).replace(NOT_XML, "\uFFFD").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v) => String(Math.round(v * 100) / 100);

// 色を fill / stroke の属性にする。#rrggbbaa・#rgba は色と不透明度に分ける（SVG 1.1 の色は不透明度を持たない）。
function paint(name, color) {
  const c = String(color ?? "none");
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(c);
  if (!m) {
    const s = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
    if (s) m = [c, s[1] + s[1] + s[2] + s[2] + s[3] + s[3], s[4] + s[4]];
  }
  if (!m) return `${name}="${esc(c)}"`;
  const opacity = parseInt(m[2], 16) / 255;
  return `${name}="#${m[1]}"${opacity < 1 ? ` ${name}-opacity="${num(opacity)}"` : ""}`;
}

const points = (list) => list.map((p) => `${num(p.x)},${num(p.y)}`).join(" ");

function group(kind, name, parts) {
  return `<g data-${kind}="${esc(name)}">${parts.join("")}</g>`;
}

// 1 行の文字。anchor: 横の揃え（"middle" | "start"）。y は文字の縦の真ん中。
function text(x, y, label, { size, color, bold = false, anchor = "middle" }) {
  return `<text x="${num(x)}" y="${num(y)}" font-family="${FONT}" font-size="${num(size)}"${bold ? ' font-weight="600"' : ""} text-anchor="${anchor}" dominant-baseline="central" ${paint("fill", color)}>${esc(label)}</text>`;
}

// 行に分けた文字を、(cx, cy) を真ん中にそろえて並べる。
function lines(cx, cy, label, style) {
  const all = labelLines(label);
  const height = style.size * (LINE_HEIGHT / FONT_SIZE);
  const top = cy - (all.length * height) / 2 + height / 2;
  return all.map((line, i) => text(cx, top + i * height, line, style)).join("");
}

function rect(x, y, width, height, { rx = 0, fill = "none", stroke = null, strokeWidth = 1, dashed = false } = {}) {
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}"${rx ? ` rx="${num(rx)}"` : ""} ${paint("fill", fill)}${stroke ? ` ${paint("stroke", stroke)} stroke-width="${num(strokeWidth)}"` : ""}${dashed ? ' stroke-dasharray="5 4"' : ""}/>`;
}

function line(a, b, color, { width = 1, dashed = false } = {}) {
  return `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" ${paint("stroke", color)} stroke-width="${num(width)}"${dashed ? ' stroke-dasharray="5 4"' : ""}/>`;
}

function polyline(list, color, { width, dashed }) {
  return `<polyline points="${points(list)}" fill="none" ${paint("stroke", color)} stroke-width="${num(width)}" stroke-linejoin="round"${dashed ? ` stroke-dasharray="${num(5 * width)} ${num(4 * width)}"` : ""}/>`;
}

function polygon(list, fill, stroke = null, strokeWidth = 1) {
  return `<polygon points="${points(list)}" ${paint("fill", fill)}${stroke ? ` ${paint("stroke", stroke)} stroke-width="${num(strokeWidth)}"` : ""}/>`;
}

// to の点に向かう矢じり（塗りの三角）。
function arrowHead(from, to, size) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const side = (s) => ({ x: to.x - size * Math.cos(a) + s * size * 0.5 * Math.cos(a + Math.PI / 2), y: to.y - size * Math.sin(a) + s * size * 0.5 * Math.sin(a + Math.PI / 2) });
  return [to, side(1), side(-1)];
}

function shapePoints(n) {
  const x = n.x, y = n.y, w = n.width, h = n.height;
  switch (n.shape) {
    case "rhombus": return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }];
    case "hexagon": { const k = Math.min(w / 4, h / 2); return [{ x: x + k, y }, { x: x + w - k, y }, { x: x + w, y: y + h / 2 }, { x: x + w - k, y: y + h }, { x: x + k, y: y + h }, { x, y: y + h / 2 }]; }
    case "parallelogram": { const k = h / 2; return [{ x: x + k, y }, { x: x + w, y }, { x: x + w - k, y: y + h }, { x, y: y + h }]; }
    case "trapezoid": { const k = h / 2; return [{ x: x + k, y }, { x: x + w - k, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }
    case "flag": { const k = h / 3; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + k, y: y + h / 2 }]; }
    default: return null;
  }
}

function cornerRadius(n) {
  if (n.shape === "round") return 8;
  if (n.shape === "stadium" || n.shape === "circle" || n.shape === "double-circle") return Math.min(n.width, n.height) / 2;
  if (n.shape === "cylinder") return 10;
  return 3;
}

function flowchart(l, c) {
  const out = [];
  for (const k of l.clusters) {
    out.push(group("cluster", k.id, [
      rect(k.x, k.y, k.width, k.height, { rx: 6, fill: c.surface, stroke: c.border }),
      text(k.x + 8, k.y + 3 + 9, k.title, { size: 12, color: c.muted, anchor: "start" }),
    ]));
  }
  const nodes = Object.fromEntries(l.nodes.map((n) => [n.id, n]));
  l.edges.forEach((e, i) => {
    const pts = e.points.slice();
    pts[0] = shapeAnchor(nodes[e.from], pts[0]);
    pts[pts.length - 1] = shapeAnchor(nodes[e.to], pts[pts.length - 1]);
    const width = e.kind === "thick" ? 2.5 : 1.2;
    const head = e.kind !== "line";
    const end = pts[pts.length - 1], before = pts[pts.length - 2] ?? pts[0];
    const size = 9;
    // 矢じりの分だけ線を手前で止める。
    if (head) {
      const d = Math.hypot(end.x - before.x, end.y - before.y) || 1;
      pts[pts.length - 1] = { x: end.x - ((end.x - before.x) / d) * size * 0.8, y: end.y - ((end.y - before.y) / d) * size * 0.8 };
    }
    const parts = [polyline(pts, c.muted, { width, dashed: e.kind === "dotted" })];
    if (head) parts.push(polygon(arrowHead(before, end, size), c.muted));
    if (e.label) {
      const all = labelLines(e.label);
      const w = Math.max(...all.map((x) => textWidth(x, 12))) + 8, h = all.length * LINE_HEIGHT;
      parts.push(rect(e.labelX - w / 2, e.labelY - h / 2, w, h, { rx: 3, fill: c.background }));
      parts.push(lines(e.labelX, e.labelY, e.label, { size: 12, color: c.muted }));
    }
    out.push(group("edge", String(i), parts));
  });
  for (const n of l.nodes) {
    const st = n.style ?? {};
    const fill = st.fill ?? c.raised, stroke = st.stroke ?? c.muted, color = st.color ?? c.foreground;
    const strokeWidth = st.strokeWidth ?? 1;
    const poly = shapePoints(n);
    const parts = [];
    if (poly) parts.push(polygon(poly, fill, stroke, strokeWidth));
    else {
      const rx = cornerRadius(n);
      parts.push(rect(n.x, n.y, n.width, n.height, { rx, fill, stroke, strokeWidth }));
      if (n.shape === "double-circle") parts.push(rect(n.x + 4, n.y + 4, n.width - 8, n.height - 8, { rx: Math.max(0, rx - 4), stroke }));
      if (n.shape === "subroutine") {
        parts.push(line({ x: n.x + 4, y: n.y }, { x: n.x + 4, y: n.y + n.height }, stroke));
        parts.push(line({ x: n.x + n.width - 4, y: n.y }, { x: n.x + n.width - 4, y: n.y + n.height }, stroke));
      }
    }
    parts.push(lines(n.x + n.width / 2, n.y + n.height / 2, n.label, { size: FONT_SIZE, color }));
    out.push(group("node", n.id, parts));
  }
  return out;
}

function sequence(l, c) {
  const out = [];
  l.blocks.forEach((b, i) => {
    const parts = [rect(b.x, b.y, b.width, b.height, { rx: 4, stroke: c.border })];
    b.sections.forEach((sec, k) => {
      if (k > 0) parts.push(line({ x: b.x, y: sec.y }, { x: b.x + b.width, y: sec.y }, c.border, { dashed: true }));
      const label = k === 0 ? `${b.type}  ${sec.label}` : `else  ${sec.label}`;
      parts.push(text(b.x + 6, sec.y + 4 + 7, label, { size: 11, color: c.muted, anchor: "start" }));
    });
    out.push(group("block", String(i), parts));
  });
  for (const p of l.participants) {
    const parts = [line({ x: p.x, y: l.lifelineTop }, { x: p.x, y: l.lifelineBottom }, c.border, { dashed: true })];
    for (const top of [12, l.footerY]) {
      parts.push(rect(p.boxX, top, p.boxWidth, p.boxHeight, { rx: p.actor ? 14 : 3, fill: c.raised, stroke: c.muted }));
      parts.push(text(p.boxX + p.boxWidth / 2, top + p.boxHeight / 2, p.label, { size: FONT_SIZE, color: c.foreground, bold: true }));
    }
    out.push(group("participant", p.id, parts));
  }
  l.activations.forEach((a, i) => {
    out.push(group("activation", String(i), [rect(a.x - 5 + a.depth * 4, a.y1, 10, Math.max(2, a.y2 - a.y1), { fill: c.raised, stroke: c.muted })]));
  });
  l.messages.forEach((m, i) => {
    const size = 9;
    let pts;
    if (m.self) pts = [{ x: m.x1, y: m.y - 14 }, { x: m.x1 + 36, y: m.y - 14 }, { x: m.x1 + 36, y: m.y }, { x: m.x1 + 4, y: m.y }];
    else {
      const dir = Math.sign(m.x2 - m.x1) || 1;
      pts = [{ x: m.x1, y: m.y }, { x: m.x2 - dir * (m.head === "arrow" ? size * 0.8 : 0), y: m.y }];
    }
    const parts = [polyline(pts, c.muted, { width: 1.2, dashed: m.line === "dotted" })];
    const end = m.self ? { x: m.x1 + 2, y: m.y } : { x: m.x2, y: m.y };
    const before = m.self ? { x: m.x1 + 36, y: m.y } : { x: m.x1, y: m.y };
    if (m.head === "arrow") parts.push(polygon(arrowHead(before, end, size), c.muted));
    if (m.head === "cross") {
      const k = size * 0.45;
      parts.push(line({ x: end.x - k, y: end.y - k }, { x: end.x + k, y: end.y + k }, c.muted, { width: 1.2 }));
      parts.push(line({ x: end.x - k, y: end.y + k }, { x: end.x + k, y: end.y - k }, c.muted, { width: 1.2 }));
    }
    const y = m.y - (m.self ? 30 : 20) + 8;
    parts.push(m.self
      ? text(m.textX, y, m.text, { size: 12, color: c.foreground, anchor: "start" })
      : text((m.x1 + m.x2) / 2, y, m.text, { size: 12, color: c.foreground }));
    out.push(group("message", String(i), parts));
  });
  l.notes.forEach((n, i) => {
    out.push(group("note", String(i), [
      rect(n.x, n.y, n.width, n.height, { rx: 3, fill: c.surface, stroke: c.border }),
      lines(n.x + n.width / 2, n.y + n.height / 2, n.text, { size: 12, color: c.foreground }),
    ]));
  });
  return out;
}

// layout: layoutFlowchart / layoutSequence の結果。colors: diagramColors の結果。width / height: 書き出しの大きさ（px）。
// view: 書き出す範囲（配置の座標の { x, y, width, height }。タイルの切れ端）。無ければ図の全体。
export function diagramSvg(layout, colors, { width, height, view = null }) {
  const body = layout.type === "flowchart" ? flowchart(layout, colors) : sequence(layout, colors);
  const v = view ?? { x: 0, y: 0, width: layout.width, height: layout.height };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" viewBox="${viewBox(v)}">${body.join("")}</svg>`;
}

const viewBox = (v) => `${num(v.x)} ${num(v.y)} ${num(v.width)} ${num(v.height)}`;

// SVG の文字列の書き出しの大きさ（ルートの width と height）だけを替える（中身はそのまま。配置し直さずに倍率を変える）。
// view を渡すと viewBox もその範囲（配置の座標）にする（タイルの切れ端）。
export function resizeSvg(svg, { width, height, view = null }) {
  const sized = svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${num(width)}" height="${num(height)}"`);
  return view ? sized.replace(/^(<svg[^>]*?) viewBox="[^"]*"/, `$1 viewBox="${viewBox(view)}"`) : sized;
}
