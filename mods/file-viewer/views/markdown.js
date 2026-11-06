// markdown viewer の整形表示。タブの今の内容（保存前の編集を含む）を表示する。
import { div } from "gpui-kit";
import { v_flex, TextView } from "gpui-base";
import { rewriteLocalImages } from "../lib/markdown.js";

// text: 表示する Markdown。onLink(url, cx): リンクを押したとき。
export function markdownBody({ id, text, onLink, t }) {
  return v_flex().id(`${id}-scroll`).flex_1().min_h(0).overflow_y_scrollbar().px(24).py(16).text_color(t.foreground)
    .child(TextView.markdown(id, rewriteLocalImages(text)).selectable(true).on_link_click((url, cx) => onLink(url, cx)))
    .child(div().h(24).flex_none());
}
