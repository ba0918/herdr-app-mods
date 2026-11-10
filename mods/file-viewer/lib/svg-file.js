// image viewer の SVG を、画面に出す大きさで書き直したコピーで出す見え方（仕様の「表示の大きさで書き直す」）。
// .mmd（lib/mmd.js）と同じく、Markdown の整形表示の決まり（lib/markdown-state.js）で、ファイル全体を部分 1 つの文書として扱う。
// 中身は { text, key }: text は SVG の全文、key は同じファイル（machine・パス）の同じ中身を見分ける鍵の元（svgSource）。
// 部分の配置の大きさは書かれた大きさで、書き出しは根の要素を書き換えた全文（lib/svg-root.js の rewriteSvg。main.js が書く）。
import { readSvgRoot } from "./svg-root.js";
import { MarkdownState } from "./markdown-state.js";
import { scaleLook, fitLook, maxSvgScale, svgDrawable } from "./diagram-files.js";

// content の準備。1 単位（根の要素を読む）で終わる。parts は SVG の部分 1 つ: { type: "svg", source, text, root, layout }。
// layout（{ width, height, styled }。styled は CSS を持つか）の無い部分は書き直さない: 書かれた大きさが決められない SVG は asis（元のままコピーする）、app が描けない SVG と、書く大きさの
// 上限の中で短い辺が 1 px に満たないほど縦横の比が極端な SVG は error（{ message }）を持つ。
export function startSvgPreparation(content) {
  const prep = {
    parts: [], done: false, failed: false,
    advance() {
      if (!prep.done) {
        const root = readSvgRoot(content.text);
        const part = { type: "svg", source: content.key, text: content.text, root };
        const layout = root.kind === "rewrite" ? { width: root.width, height: root.height, styled: root.styled } : null;
        if (layout && svgDrawable(layout)) part.layout = layout;
        else if (layout) part.error = { message: "縦横の比が極端で表示できない" };
        else if (root.kind === "asis") part.asis = true;
        else part.error = { message: root.reason };
        prep.parts.push(part);
        prep.done = true;
      }
      return true;
    },
  };
  return prep;
}

const OUTSIDE = () => ({ inRender: false, over: null });

// image viewer の SVG の見え方の決まり。出し方だけが MarkdownState と違う: 開けない案内（開くときの失敗の代わりの整形表示か、
// app が描けない部分）を出している間に中身が変わったら、開くときと同じく、新しい中身の準備の間は読み込み中にする（前の理由の案内の
// ままにしない。Markdown と .mmd は、新しい結果が出るまで代わりの整形表示のまま）。
class SvgFileState extends MarkdownState {
  display() {
    const d = super.display();
    const preparing = this.job !== null && !this.job.restyle && this.job.text === this.text && this.shown?.text !== this.text;
    if (preparing && (d.kind === "fallback" || (d.kind === "previous" && d.parts[0]?.error))) return { kind: "loading", notices: [] };
    return d;
  }
}

// fileOf: SVG の部分を見た目で書き出すファイル（lib/diagram-files.js の diagramFile）。preloadWait・timeLimit は MarkdownState と同じ。
export function svgFileState({ fileOf, timeLimit, preloadWait = 0 } = {}) {
  return new SvgFileState({ start: startSvgPreparation, judge: OUTSIDE, fileOf, preloadWait, keepShown: true, ...(timeLimit ? { timeLimit } : {}) });
}

// MarkdownState の display() を、image viewer の SVG の出し方にする。
// { kind: "loading" | "picture" | "error" | "asis", part?, message?, notices }。picture の part は書いた絵を file に持つ。asis は、
// 書かれた大きさが決められず、元のままのコピーで出す SVG（main.js が中身を読んだときに分けるので、ふつうは来ない）。
// 開くときの失敗（絵の席に書けない、打ち切り）と app が描けない SVG は error（開けない案内の、読み込みの失敗の理由）。
// notices は知らせるだけのもの（倍率を変えたときと中身が変わったときの書き直しの失敗。前の絵のまま出す）。
export function svgFileView(display) {
  if (display.kind === "preparing" || display.kind === "loading") return { kind: "loading", notices: display.notices };
  if (display.kind === "fallback") return { kind: "error", message: reason(display.notices[0]), notices: [] };
  const part = display.parts[0];
  if (part.error) return { kind: "error", message: part.error.message, notices: [] };
  if (part.asis) return { kind: "asis", notices: [] };
  return { kind: "picture", part, notices: display.notices };
}

function reason(failure) {
  if (failure?.kind === "timeout") return "10 秒たっても読み込みが終わらなかった";
  return `絵を書けなかった（${failure?.message ?? ""}）`;
}

// SVG を書く見た目（.mmd の mmdLook と同じ形）: 倍率か、枠に収める倍率（上限は zoom.fitMax）。枠がまだ測れなければ viewport（窓の
// 描ける大きさ）で見積もる。SVG は色に関わらないので、色は決まった値（null）。zoom: image viewer のズーム（views/zoom.js の Zoom）。
// 倍率が書かれた大きさ layout の上限（書く面積とタイルの数が上限に収まる倍率。maxSvgScale）を超えていれば（中身が変わって書かれた
// 大きさが大きくなった）、zoom の倍率を上限に下げる。縦横の比が極端で書けない layout（開けない案内を出す）では下げない（次に中身が
// 書ける SVG に替わったとき、倍率がごく小さいまま残らないように）。
export function svgLook(zoom, layout, viewport) {
  if (!zoom.fit) {
    if (svgDrawable(layout)) zoom.scale = Math.min(zoom.scale, maxSvgScale(layout));
    return scaleLook(null, zoom.scale);
  }
  const view = zoom.view ?? viewport;
  return fitLook(null, { width: view.width, height: view.height, max: zoom.fitMax });
}

// 書き直した SVG の鍵の元（部分の source）: machine・パス・大きさ・更新時刻と中身のハッシュ。lib/diagram-files.js の diagramFile が
// 書く大きさとタイルの位置を足して、絵の席の鍵にする。図の鍵（図のソース）とも画像の鍵（lib/seats.js の imageKey）とも混ざらない
// よう、先頭に NUL と svg を入れる。中身の全文は入れない（6 MB の文字列を表に置かない）。ハッシュを入れるので、大きさと更新時刻が
// 同じまま中身だけ変わった SVG は、前の中身の絵の席を共有しない。
export function svgSource({ machine, path, size, mtime, hash }) {
  return `\u0000svg\n${machine ?? ""}\n${path}\n${size}\n${mtime}\n${hash}`;
}
