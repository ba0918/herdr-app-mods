// markdown viewer の整形表示。タブの今の内容（保存前の編集を含む）を表示する。
// 整形表示の部品（TextView）の中に図を埋め込めないので、```mermaid ブロックの境目で区切り、
// 文章は TextView、図は図の要素として縦に並べる。
import { div } from "gpui-kit";
import { v_flex, TextView } from "gpui-base";
import { rewriteImages, collectDefinitions, splitMermaidBlocks } from "../lib/markdown.js";
import { diagram } from "./mermaid.js";

const PAD_X = 24;

// 描けない図: コードのまま出し、その上に理由を添える。
export function diagramError({ id, message, fence, t }) {
  return v_flex().id(id).gap(4).flex_none()
    .child(div().px(10).py(4).rounded(4).bg(t.raised).text_size(12).text_color(t.blocked).child(`この図は表示できない（${message}）`))
    .child(TextView.markdown(`${id}-code`, fence).selectable(true));
}

// text: 表示する Markdown。layoutOf(source, firstLine): { layout } か { error }。
// onLink(url, cx): リンクを押したとき。onDiagram(source, firstLine): 図を押したとき。
// 文章の部分は画像を押せる名前に書き換える。参照形式の定義は、分ける前の文書全体から集めて各部分に渡す
// （図の行番号は分けたあとの元の Markdown で数えるので、書き換えは行番号に影響しない）。
function partsOf(text, box) {
  if (box.parts?.text === text) return box.parts.list;
  const definitions = collectDefinitions(text);
  const list = splitMermaidBlocks(text).map((part) => (part.type === "markdown" ? { ...part, text: rewriteImages(part.text, definitions) } : part));
  box.parts = { text, list };
  return list;
}

// box: 本文の幅と、書き換えた部分（同じ内容なら描き直しのたびに書き換えない）を覚える入れ物。
export function markdownBody({ id, text, layoutOf, onLink, onDiagram, box, t }) {
  const width = Math.max(120, (box.width ?? 800) - PAD_X * 2);
  const parts = partsOf(text, box);
  return v_flex().id(`${id}-scroll`).flex_1().min_h(0).overflow_y_scrollbar().px(PAD_X).py(16).gap(12).text_color(t.foreground)
    .on_size_change((size, cx) => { if (size.width !== box.width) { box.width = size.width; cx.notify(); } })
    .children(parts.map((part, i) => {
      if (part.type === "markdown") {
        return TextView.markdown(`${id}-${i}`, part.text).selectable(true).on_link_click((url, cx) => onLink(url, cx));
      }
      const r = layoutOf(part.source, part.firstLine);
      if (r.error) return diagramError({ id: `${id}-${i}`, message: r.error.message, fence: part.fence, t });
      const scale = Math.min(1, width / r.layout.width);
      return div().id(`${id}-${i}`).flex_none().cursor_pointer().rounded(6).py(6).hover((s) => s.bg(t.hover))
        .on_click(() => onDiagram(part.source, part.firstLine))
        .child(diagram(r.layout, scale, t));
    }))
    .child(div().h(24).flex_none());
}
