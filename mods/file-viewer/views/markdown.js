// markdown viewer の整形表示。整形の準備の結果（lib/prepare.js）を描く。
// 整形表示の部品（TextView）の中に図を埋め込めないので、```mermaid ブロックの境目で区切った部分を、
// 文章は TextView、図は書き出した SVG の画像 1 つとして縦に並べる。
import { div, image } from "gpui-kit";
import { v_flex, TextView, Slider, SliderTrack, SliderIndicator, SliderThumb } from "gpui-base";

const PAD_X = 24;

// 本文の幅（図を縮めて置く幅）。box: 整形表示の場所の大きさを覚える入れ物。まだ分からなければ null。
export function bodyWidth(box) {
  return box.width === undefined ? null : Math.max(120, box.width - PAD_X * 2);
}

// 整形表示の場所の大きさを覚える（本文の幅が変わったら描き直す）。
const measure = (box) => (size, cx) => { if (size.width !== box.width) { box.width = size.width; cx.notify(); } };

// 書き出した図の絵。大きな絵はタイル（同じ絵の切れ端）を隙間なく並べる（lib/diagram-files.js）。どれも書き出しの大きさのまま出す。
export function diagramImage(file) {
  const tiles = file.tiles ?? [file];
  if (tiles.length === 1) return image(tiles[0].path).w(file.width).h(file.height);
  return div().relative().flex_none().w(file.width).h(file.height)
    .children(tiles.map((t) => image(t.path).absolute().left(t.x).top(t.y).w(t.width).h(t.height)));
}

// 描けない図: コードのまま出し、その上に理由を添える。
export function diagramError({ id, message, fence, t }) {
  return v_flex().id(id).gap(4).flex_none()
    .child(div().px(10).py(4).rounded(4).bg(t.raised).text_size(12).text_color(t.blocked).child(`この図は表示できない（${message}）`))
    .child(TextView.markdown(`${id}-code`, fence).selectable(true));
}

// parts: 整形の準備の結果（lib/prepare.js の parts。文章の部分は画像を押せる名前に書き換えた Markdown、図の部分は配置か失敗で、
// 書き出した SVG を file { path, width, height } に持つ）。
// onLink(url, cx): リンクを押したとき。onDiagram(part, cx): 図を押したとき。
// box: 本文の幅を覚える入れ物。前の整形表示から差し替えるときも要素の id を変えない（スクロールの位置が保たれる。ガイドの「制約」）。
// scroll: スクロールの位置（lib/body-scroll.js）。本文は app の部品でスクロールさせず、位置の分だけ上にずらして出す。
// bar: スクロールバーのつまみの状態（SliderState。0〜BAR_MAX、下が 0）。onScroll(changed, cx): 位置（changed が true のとき）か
// 本文や本文の場所の大きさが変わりうるとき（つまみを合わせ、要れば描き直す）。
export const BAR_MAX = 1000;
export function markdownBody({ id, parts, onLink, onDiagram, box, scroll, bar, onScroll, t }) {
  const moved = (changed, cx) => onScroll(changed, cx);
  const content = v_flex().id(`${id}-content`).absolute().left(0).right(0).top(-scroll.shown()).px(PAD_X).py(16).gap(12)
    .on_size_change((size, cx) => moved(scroll.sized({ content: size.height }), cx))
    .children(parts.map((part, i) => {
      if (part.type === "markdown") {
        return div().id(`${id}-${i}-box`).flex_none().w_full()
          .on_size_change((size, cx) => moved(scroll.partSized(i, size.height), cx))
          .child(TextView.markdown(`${id}-${i}`, part.text).selectable(true).on_link_click((url, cx) => onLink(url, cx)));
      }
      if (part.error) return diagramError({ id: `${id}-${i}`, message: part.error.message, fence: part.fence, t });
      const file = part.file;
      return div().id(`${id}-${i}`).flex_none().cursor_pointer().rounded(6).py(6).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => onDiagram(part, cx))
        .child(file ? diagramImage(file) : div());
    }))
    .child(div().h(24).flex_none());
  return div().id(`${id}-scroll`).relative().flex_1().min_h(0).w_full().overflow_hidden().text_color(t.foreground)
    .on_size_change((size, cx) => { measure(box)(size, cx); moved(scroll.sized({ view: size.height }), cx); })
    .on_scroll_wheel((e, cx) => moved(scroll.wheel(e.delta.y), cx))
    .child(content)
    .when(scroll.max() > 0, (el) => el.child(scrollBar({ id: `${id}-bar`, bar, t })));
}

// 本文の右端のスクロールバー。つまみを動かすと bar の "change" が来る。
const BAR_THUMB = 40;
function scrollBar({ id, bar, t }) {
  return Slider.new(bar).id(id).axis("vertical").absolute().top(2).bottom(2).right(2).w(8)
    // つまみの中心が動く範囲（Indicator）を、つまみの半分ずつ内側にする（端でもつまみが欠けない）。
    .child(SliderTrack.new(bar).axis("vertical").size_full().py(BAR_THUMB / 2)
      .child(SliderIndicator.new(bar).axis("vertical").relative().size_full()
        .child(SliderThumb.new(bar).axis("vertical").w(8).h(BAR_THUMB).mb(-BAR_THUMB / 2).rounded(4).bg(t.border).hover((s) => s.bg(t.dim)))));
}

// 整形表示を出す前に待つ間に、整形表示の場所に出すもの（進み具合は出さない）。loading: 開くときの待ち（ファイルの読み込み中と
// 同じ「読み込み中…」）か、「整形中…」か。待つ間も本文の幅を測る（図を書き出す大きさを決めるため）。
export function markdownWaiting({ id, loading, box, t }) {
  const el = div().id(id).relative().flex_1().min_h(0).w_full().text_color(t.dim).on_size_change(measure(box));
  return loading ? el.p(16).child("読み込み中…") : el.px(PAD_X).py(16).child("整形中…");
}

// 書いた SVG を、見えない所（1 px に切り抜いた枠）に置いて、app に画像として読み込ませる。読み込む前に出すと図の場所が空いて見えるので、
// 読み込み終えてから出す。読み込み中の画像は大きさが 0 で、読み込み終えると画像の大きさになる（ガイドの「image(path) の読み込み」）。
// files: { name, path } の並び。onLoaded(name, cx): 読み込み終えたとき。
export function preloadImages({ id, files, onLoaded }) {
  return div().id(id).absolute().top(0).left(0).w(1).h(1).overflow_hidden()
    .children(files.map((f) => div().id(`${id}-${f.name}`).flex_none()
      .on_size_change((size, cx) => { if (size.height > 0) onLoaded(f.name, cx); })
      .child(image(f.path))));
}
