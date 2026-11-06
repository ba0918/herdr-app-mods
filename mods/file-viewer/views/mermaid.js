// Mermaid の図を描く。ノードや枠は位置指定の要素、線と矢印は window.paint_path で描く。
// 色はテーマ色に従い、flowchart の style / classDef / class の色はそのノードに使う。
import { div, PathBuilder } from "gpui-kit";
import { v_flex } from "gpui-base";
import { labelLines, LINE_HEIGHT, FONT_SIZE } from "../lib/mermaid/layout.js";
import { shapeAnchor } from "../lib/mermaid/geometry.js";

// mod の中の window は GPUI の窓（herdr の window() とは別物）。
const paint = (path, color) => window.paint_path(path, color).absolute().top(0).left(0).size_full();

function polyline(points, width, dashed) {
  let b = PathBuilder.stroke(width);
  if (dashed) b = b.dash_array([5 * Math.max(1, width), 4 * Math.max(1, width)]);
  points.forEach((p, i) => { b = i === 0 ? b.move_to(p.x, p.y) : b.line_to(p.x, p.y); });
  return b.build();
}

function polygon(points, fill) {
  return (fill ? PathBuilder.fill() : PathBuilder.stroke(1)).add_polygon(points.map((p) => [p.x, p.y]), true).build();
}

// to の点に向かう矢じり（塗りの三角）。
function arrowHead(from, to, size) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const p = (d, s) => ({ x: to.x - size * Math.cos(a) + s * size * 0.5 * Math.cos(a + Math.PI / 2) * d, y: to.y - size * Math.sin(a) + s * size * 0.5 * Math.sin(a + Math.PI / 2) * d });
  return [to, p(1, 1), p(1, -1)];
}

function crossHead(to, size) {
  return [[{ x: to.x - size, y: to.y - size }, { x: to.x + size, y: to.y + size }], [{ x: to.x - size, y: to.y + size }, { x: to.x + size, y: to.y - size }]];
}

function text(id, label, { x, y, width, height, color, size, bold }) {
  return v_flex().id(id).absolute().left(x).top(y).w(width).h(height).items_center().justify_center().text_color(color).text_size(size)
    .when(Boolean(bold), (el) => el.font_semibold())
    .children(labelLines(label).map((line) => div().whitespace_nowrap().line_height(size * (LINE_HEIGHT / FONT_SIZE)).child(line)));
}

const scaled = (s) => (p) => ({ x: p.x * s, y: p.y * s });

function shapePoints(n, s) {
  const x = n.x * s, y = n.y * s, w = n.width * s, h = n.height * s;
  switch (n.shape) {
    case "rhombus": return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }];
    case "hexagon": { const k = Math.min(w / 4, h / 2); return [{ x: x + k, y }, { x: x + w - k, y }, { x: x + w, y: y + h / 2 }, { x: x + w - k, y: y + h }, { x: x + k, y: y + h }, { x, y: y + h / 2 }]; }
    case "parallelogram": { const k = h / 2; return [{ x: x + k, y }, { x: x + w, y }, { x: x + w - k, y: y + h }, { x, y: y + h }]; }
    case "trapezoid": { const k = h / 2; return [{ x: x + k, y }, { x: x + w - k, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }
    case "flag": { const k = h / 3; return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + k, y: y + h / 2 }]; }
    default: return null;
  }
}

function flowchart(l, s, t) {
  const out = [];
  const line = t.muted, fg = t.foreground;
  for (const c of l.clusters) {
    out.push(div().absolute().left(c.x * s).top(c.y * s).w(c.width * s).h(c.height * s).rounded(6 * s).border_1().border_color(t.border).bg(t.surface));
    out.push(div().id(`c-${c.id}`).absolute().left(c.x * s + 8 * s).top(c.y * s + 3 * s).text_size(12 * s).text_color(t.muted).whitespace_nowrap().child(c.title));
  }
  const nodes = Object.fromEntries(l.nodes.map((n) => [n.id, n]));
  for (const e of l.edges) {
    const pts = e.points.slice();
    pts[0] = shapeAnchor(nodes[e.from], pts[0]);
    pts[pts.length - 1] = shapeAnchor(nodes[e.to], pts[pts.length - 1]);
    const p = pts.map(scaled(s));
    const width = (e.kind === "thick" ? 2.5 : 1.2) * Math.max(0.6, s);
    const head = e.kind !== "line";
    const end = p[p.length - 1], before = p[p.length - 2] ?? p[0];
    const size = 9 * Math.max(0.6, s);
    // 矢じりの分だけ線を手前で止める。
    if (head) {
      const d = Math.hypot(end.x - before.x, end.y - before.y) || 1;
      p[p.length - 1] = { x: end.x - ((end.x - before.x) / d) * size * 0.8, y: end.y - ((end.y - before.y) / d) * size * 0.8 };
    }
    out.push(paint(polyline(p, width, e.kind === "dotted"), line));
    if (head) out.push(paint(polygon(arrowHead(before, end, size), true), line));
  }
  for (const n of l.nodes) {
    const st = n.style ?? {};
    const fill = st.fill ?? t.raised, stroke = st.stroke ?? t.muted, color = st.color ?? fg;
    const x = n.x * s, y = n.y * s, w = n.width * s, h = n.height * s;
    const poly = shapePoints(n, s);
    if (poly) {
      out.push(paint(polygon(poly, true), fill));
      out.push(paint(PathBuilder.stroke(Math.max(1, (st.strokeWidth ?? 1) * s)).add_polygon(poly.map((q) => [q.x, q.y]), true).build(), stroke));
    } else {
      const radius = n.shape === "round" ? 8 * s : n.shape === "stadium" || n.shape === "circle" || n.shape === "double-circle" ? Math.min(w, h) / 2 : n.shape === "cylinder" ? 10 * s : 3 * s;
      out.push(div().absolute().left(x).top(y).w(w).h(h).rounded(radius).bg(fill).border_color(stroke).border(Math.max(1, (st.strokeWidth ?? 1) * s))
        .when(n.shape === "double-circle" || n.shape === "subroutine", (el) => el.child(div().absolute().left(4 * s).top(n.shape === "subroutine" ? 0 : 4 * s).right(4 * s).bottom(n.shape === "subroutine" ? 0 : 4 * s).rounded(n.shape === "subroutine" ? 0 : radius).border_color(stroke).border(1))));
    }
    out.push(text(`n-${n.id}`, n.label, { x, y, width: w, height: h, color, size: FONT_SIZE * s }));
  }
  for (const [i, e] of l.edges.entries()) {
    if (!e.label) continue;
    const lines = labelLines(e.label);
    const w = (Math.max(...lines.map((x) => x.length)) * FONT_SIZE * 1.1 + 8) * s, h = lines.length * LINE_HEIGHT * s;
    out.push(v_flex().id(`el-${i}`).absolute().left(e.labelX * s - w / 2).top(e.labelY * s - h / 2).px(4 * s).rounded(3 * s).bg(t.background).items_center()
      .text_size(12 * s).text_color(t.muted).children(lines.map((x) => div().whitespace_nowrap().child(x))));
  }
  return out;
}

function sequence(l, s, t) {
  const out = [];
  const line = t.muted, fg = t.foreground;
  for (const [bi, b] of l.blocks.entries()) {
    out.push(div().absolute().left(b.x * s).top(b.y * s).w(b.width * s).h(b.height * s).border_1().border_color(t.border).rounded(4 * s));
    b.sections.forEach((sec, i) => {
      if (i > 0) out.push(paint(polyline([{ x: b.x * s, y: sec.y * s }, { x: (b.x + b.width) * s, y: sec.y * s }], 1, true), t.border));
      const label = i === 0 ? `${b.type}  ${sec.label}` : `else  ${sec.label}`;
      out.push(div().id(`b-${bi}-${i}`).absolute().left(b.x * s + 6 * s).top(sec.y * s + 4 * s).text_size(11 * s).text_color(t.muted).whitespace_nowrap().child(label));
    });
  }
  for (const p of l.participants) {
    out.push(paint(polyline([{ x: p.x * s, y: l.lifelineTop * s }, { x: p.x * s, y: l.lifelineBottom * s }], 1, true), t.border));
  }
  for (const a of l.activations) {
    const w = 10 * s;
    out.push(div().absolute().left(a.x * s - w / 2 + a.depth * 4 * s).top(a.y1 * s).w(w).h(Math.max(2, (a.y2 - a.y1) * s)).bg(t.raised).border_1().border_color(t.muted));
  }
  for (const p of l.participants) {
    for (const [k, top] of [[`p-${p.id}`, 8 + 4], [`f-${p.id}`, l.footerY]]) {
      out.push(v_flex().id(`${k}-box`).absolute().left(p.boxX * s).top(top * s).w(p.boxWidth * s).h(p.boxHeight * s).rounded((p.actor ? 14 : 3) * s)
        .bg(t.raised).border_1().border_color(t.muted).items_center().justify_center().text_color(fg).text_size(FONT_SIZE * s).font_semibold()
        .child(div().whitespace_nowrap().child(p.label)));
    }
  }
  for (const [mi, m] of l.messages.entries()) {
    const width = 1.2 * Math.max(0.6, s), size = 9 * Math.max(0.6, s);
    const dashed = m.line === "dotted";
    let pts;
    if (m.self) pts = [{ x: m.x1, y: m.y - 14 }, { x: m.x1 + 36, y: m.y - 14 }, { x: m.x1 + 36, y: m.y }, { x: m.x1 + 4, y: m.y }].map(scaled(s));
    else {
      const dir = Math.sign(m.x2 - m.x1) || 1;
      pts = [{ x: m.x1, y: m.y }, { x: m.x2 - dir * (m.head === "arrow" ? size * 0.8 / s : 0), y: m.y }].map(scaled(s));
    }
    out.push(paint(polyline(pts, width, dashed), line));
    const end = m.self ? { x: (m.x1 + 2) * s, y: m.y * s } : { x: m.x2 * s, y: m.y * s };
    const before = m.self ? { x: (m.x1 + 36) * s, y: m.y * s } : { x: m.x1 * s, y: m.y * s };
    if (m.head === "arrow") out.push(paint(polygon(arrowHead(before, end, size), true), line));
    if (m.head === "cross") for (const seg of crossHead(end, size * 0.45)) out.push(paint(polyline(seg, width, false), line));
    const tx = m.self ? m.textX : Math.min(m.x1, m.x2);
    const tw = m.self ? 400 : Math.abs(m.x2 - m.x1);
    out.push(v_flex().id(`m-${mi}`).absolute().left(tx * s).top((m.y - (m.self ? 30 : 20)) * s).w(tw * s).when(!m.self, (el) => el.items_center())
      .text_size(12 * s).text_color(fg).child(div().whitespace_nowrap().child(m.text)));
  }
  l.notes.forEach((n, i) => {
    out.push(div().id(`note-${i}-box`).absolute().left(n.x * s).top(n.y * s).w(n.width * s).h(n.height * s).rounded(3 * s).bg(t.surface).border_1().border_color(t.border));
    out.push(text(`note-${i}`, n.text, { x: n.x * s, y: n.y * s, width: n.width * s, height: n.height * s, color: fg, size: 12 * s }));
  });
  return out;
}

// layout: layoutFlowchart / layoutSequence の結果。scale で縮める（拡大表示では大きくする）。
export function diagram(layout, scale, t) {
  const s = scale;
  return div().relative().w(layout.width * s).h(layout.height * s).flex_none()
    .children(layout.type === "flowchart" ? flowchart(layout, s, t) : sequence(layout, s, t));
}
