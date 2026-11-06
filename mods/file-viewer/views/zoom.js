// 拡大・移動して見る表示（image viewer と Mermaid 図の拡大表示で共有する）。
// 最初は枠に収まる大きさ。ボタンと ctrl+ホイールで拡大縮小、ドラッグで移動、等倍 / 収まる大きさに戻せる。
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";

const MIN = 0.05, MAX = 32, STEP = 1.25;

export class Zoom {
  // fitMax: 枠に収めるときの最大の倍率（画像は 1 = 等倍まで、図の拡大表示は大きくしてよい）。
  constructor({ fitMax = 1 } = {}) {
    this.fitMax = fitMax;
    this.fit = true;   // 枠に収まる大きさに追従している
    this.scale = 1;
    this.x = 0;        // 中心からのずれ（px）
    this.y = 0;
    this.view = null;  // 枠の大きさ { width, height }
    this.drag = null;
  }

  fitScale(width, height) {
    if (!this.view || !width || !height) return 1;
    return Math.min(this.fitMax, this.view.width / width, this.view.height / height);
  }

  current(width, height) {
    return this.fit ? this.fitScale(width, height) : this.scale;
  }

  reset() { this.fit = true; this.x = 0; this.y = 0; }

  actual() { this.fit = false; this.scale = 1; this.x = 0; this.y = 0; }

  // at: 枠の中の点（その点が動かないように拡大する）。無ければ中心。
  zoomBy(factor, width, height, at) {
    const before = this.current(width, height);
    const after = Math.max(MIN, Math.min(MAX, before * factor));
    if (at && this.view) {
      const cx = at.x - this.view.width / 2, cy = at.y - this.view.height / 2;
      this.x = cx - (cx - this.x) * (after / before);
      this.y = cy - (cy - this.y) * (after / before);
    }
    this.fit = false;
    this.scale = after;
  }

  label(width, height) {
    return `${Math.round(this.current(width, height) * 100)}%`;
  }
}

function tool(id, label, t, onClick) {
  return div().id(id).h(24).min_w(24).px(6).flex_none().items_center().justify_center().rounded(6).cursor_pointer().text_size(12)
    .text_color(t.muted).hover((s) => s.bg(t.hover)).on_click((_e, cx) => { onClick(cx); cx.notify(); }).child(label);
}

// 拡大縮小のボタン列。
export function zoomTools({ id, zoom, width, height, t }) {
  return h_flex().id(`${id}-tools`).gap(2).items_center().flex_none()
    .child(tool(`${id}-out`, "−", t, () => zoom.zoomBy(1 / STEP, width, height)))
    .child(div().w(44).flex_none().text_center().text_size(12).text_color(t.muted).child(zoom.label(width, height)))
    .child(tool(`${id}-in`, "+", t, () => zoom.zoomBy(STEP, width, height)))
    .child(tool(`${id}-actual`, "等倍", t, () => zoom.actual()))
    .child(tool(`${id}-fit`, "収まる", t, () => zoom.reset()));
}

// content(w, h): 表示する大きさ w × h の要素を返す。width / height: 元の大きさ（px）。
export function zoomArea({ id, zoom, width, height, content, t }) {
  const scale = zoom.current(width, height);
  const w = Math.max(1, width * scale), h = Math.max(1, height * scale);
  const view = zoom.view ?? { width: 0, height: 0 };
  const left = view.width / 2 + zoom.x - w / 2, top = view.height / 2 + zoom.y - h / 2;
  return div().id(id).relative().flex_1().min_h(0).size_full().overflow_hidden().bg(t.canvas ?? t.background)
    .when(Boolean(zoom.drag), (el) => el.cursor_grabbing())
    .when(!zoom.drag, (el) => el.cursor_grab())
    .on_size_change((size, cx) => { zoom.view = size; cx.notify(); })
    .on_scroll_wheel((e, cx) => {
      const dy = e.delta_lines ? e.delta_lines.y * 40 : e.delta.y;
      if (e.modifiers.control || e.modifiers.platform) {
        zoom.zoomBy(Math.pow(1.0015, dy), width, height, e.local_position);
      } else {
        zoom.x += e.delta_lines ? e.delta_lines.x * 40 : e.delta.x;
        zoom.y += dy;
      }
      cx.stop_propagation();
      cx.notify();
    })
    .on_mouse_down("left", (e, cx) => { zoom.drag = { x: e.position.x, y: e.position.y, ox: zoom.x, oy: zoom.y }; cx.notify(); })
    .on_mouse_move((e, cx) => {
      if (!zoom.drag) return;
      zoom.x = zoom.drag.ox + (e.position.x - zoom.drag.x);
      zoom.y = zoom.drag.oy + (e.position.y - zoom.drag.y);
      cx.notify();
    })
    .on_mouse_up("left", (_e, cx) => { zoom.drag = null; cx.notify(); })
    .on_hover((hovered, cx) => { if (!hovered && zoom.drag) { zoom.drag = null; cx.notify(); } })
    .child(div().absolute().left(left).top(top).w(w).h(h).child(content(w, h)));
}
