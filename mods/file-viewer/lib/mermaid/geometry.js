// 図形の縁の計算。配置（dagre）は辺の端をノードの箱の縁に置くので、ひし形と円では形の縁まで寄せる。

// point: 箱の縁にある辺の端。戻り値: その点と箱の中心を結ぶ線が、ノードの形の縁と交わる点。
export function shapeAnchor(node, point) {
  const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
  const dx = point.x - cx, dy = point.y - cy;
  if (dx === 0 && dy === 0) return { x: point.x, y: point.y };
  if (node.shape === "rhombus") {
    const k = Math.abs(dx) / (node.width / 2) + Math.abs(dy) / (node.height / 2);
    return { x: cx + dx / k, y: cy + dy / k };
  }
  if (node.shape === "circle" || node.shape === "double-circle") {
    const r = Math.min(node.width, node.height) / 2, d = Math.hypot(dx, dy);
    return { x: cx + (dx * r) / d, y: cy + (dy * r) / d };
  }
  return { x: point.x, y: point.y };
}
