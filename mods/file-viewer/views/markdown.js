// markdown viewer の整形表示。整形の準備の結果（lib/prepare.js）を描く。
// 整形表示の部品（TextView）の中に図を埋め込めないので、```mermaid ブロックの境目で区切った部分を、
// 文章は TextView、図は図の要素として縦に並べる。
import { div } from "gpui-kit";
import { v_flex, TextView } from "gpui-base";
import { diagram } from "./mermaid.js";

const PAD_X = 24;

// 描けない図: コードのまま出し、その上に理由を添える。
export function diagramError({ id, message, fence, t }) {
  return v_flex().id(id).gap(4).flex_none()
    .child(div().px(10).py(4).rounded(4).bg(t.raised).text_size(12).text_color(t.blocked).child(`この図は表示できない（${message}）`))
    .child(TextView.markdown(`${id}-code`, fence).selectable(true));
}

// parts: 整形の準備の結果（lib/prepare.js の parts。文章の部分は画像を押せる名前に書き換えた Markdown、図の部分は配置か失敗）。
// onLink(url, cx): リンクを押したとき。onDiagram(source, firstLine): 図を押したとき。
// box: 本文の幅を覚える入れ物。前の整形表示から差し替えるときも要素の id を変えない（スクロールの位置が保たれる。ガイドの「制約」）。
export function markdownBody({ id, parts, onLink, onDiagram, box, t }) {
  const width = Math.max(120, (box.width ?? 800) - PAD_X * 2);
  return v_flex().id(`${id}-scroll`).flex_1().min_h(0).overflow_y_scrollbar().px(PAD_X).py(16).gap(12).text_color(t.foreground)
    .on_size_change((size, cx) => { if (size.width !== box.width) { box.width = size.width; cx.notify(); } })
    .children(parts.map((part, i) => {
      if (part.type === "markdown") {
        return TextView.markdown(`${id}-${i}`, part.text).selectable(true).on_link_click((url, cx) => onLink(url, cx));
      }
      if (part.error) return diagramError({ id: `${id}-${i}`, message: part.error.message, fence: part.fence, t });
      const scale = Math.min(1, width / part.layout.width);
      return div().id(`${id}-${i}`).flex_none().cursor_pointer().rounded(6).py(6).hover((s) => s.bg(t.hover))
        .on_click(() => onDiagram(part.source, part.firstLine))
        .child(diagram(part.layout, scale, t));
    }))
    .child(div().h(24).flex_none());
}

// 描画の外で整形の準備をしている間に、整形表示の場所に出すもの（進み具合は出さない）。
export function markdownPreparing({ id, t }) {
  return div().id(id).flex_1().min_h(0).px(PAD_X).py(16).text_color(t.dim).child("整形中…");
}
