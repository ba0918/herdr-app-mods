// 整形表示の本文のスクロールの位置。app の部品のスクロールの位置は、タブを表示していない間に消える（ガイドの「制約」の
// 「表示していない間の部品の状態」）ので、位置はタブのコピーが持ち、本文をその分だけ上にずらして出す。
//
// 作り直された整形表示の部品（TextView）は、中身を描くまでの数フレームのあいだ高さが 0 になり、本文が短く見える（タブの表示に
// 戻ったときも、ソース表示や待つ間から入ったときも）。その間（縮んでいる間）は位置を本文の長さに収めずに出し、部品が中身を
// 描いたフレームで、もとの位置に描かれるようにする。縮んでいるかは、文章の部分（中身のある Markdown）の高さで見る。
// 何も描かない部分（参照形式の定義だけなど）は高さ 0 のままなので、待つのをやめたら（expire）その部分は数えない。
export class BodyScroll {
  constructor() {
    // 覚えている位置（px）。
    this.y = 0;
    // 本文の場所の高さと、本文の高さ（px）。
    this.view = 0;
    this.content = 0;
    // 高さを見る文章の部分の番号と、分かった高さ。
    this.parts = [];
    this.heights = new Map();
    // 待つのをやめたときに高さ 0 だった部分（高さが来るまで数えない）。
    this.ignored = new Set();
    this.since = 0;
  }

  // 本文の部分の並び。indexes: 高さを見る文章の部分の番号。fresh: 部品を作り直した（高さを分からないことにする）。
  expect(indexes, now, { fresh = false } = {}) {
    this.parts = indexes;
    if (fresh) {
      this.heights = new Map();
      this.ignored = new Set();
      this.since = now;
    }
  }

  // 部品が中身を描くのを待っている（文章の部分のどれかの高さが 0 か、まだ分からない）。
  get collapsed() {
    return this.parts.some((i) => !this.ignored.has(i) && !(this.heights.get(i) > 0));
  }

  // 位置の上限。
  max() {
    return Math.max(0, this.content - this.view);
  }

  // 出す位置。
  shown() {
    return this.collapsed ? this.y : Math.min(this.y, this.max());
  }

  // 出す位置の割合（0 が先頭、1 が末尾）。
  fraction() {
    const max = this.max();
    return max > 0 ? Math.min(1, this.shown() / max) : 0;
  }

  // 部分 i の高さが分かった。出す位置か、待っているかが変わったら true。
  partSized(i, height) {
    return this.changes(() => {
      this.heights.set(i, height);
      if (height > 0) this.ignored.delete(i);
    });
  }

  // limit ms 待っても高さの来ない部分があれば、その部分を数えるのをやめる。やめたら true。
  expire(now, limit) {
    if (!this.collapsed || now - this.since < limit) return false;
    return this.changes(() => {
      for (const i of this.parts) if (!(this.heights.get(i) > 0)) this.ignored.add(i);
    });
  }

  // 本文の場所か本文の高さが変わった。出す位置が変わったら true。
  sized({ view = this.view, content = this.content }) {
    return this.changes(() => {
      this.view = view;
      this.content = content;
    });
  }

  // ホイールで dy だけ動かす（dy は正で上へ）。位置が変わったら true。縮んでいる間は本文の長さで止めない。
  wheel(dy) {
    const y = this.shown() - dy;
    return this.moveTo(Math.max(0, this.collapsed ? y : Math.min(y, this.max())));
  }

  // 割合 f（0〜1）の位置へ動かす。位置が変わったら true。
  moveToFraction(f) {
    return this.moveTo(Math.round(Math.max(0, Math.min(1, f)) * this.max()));
  }

  moveTo(y) {
    if (y === this.y) return false;
    this.y = y;
    return true;
  }

  changes(update) {
    const shown = this.shown(), collapsed = this.collapsed;
    update();
    return this.shown() !== shown || this.collapsed !== collapsed;
  }
}

// 高さを見る文章の部分の番号（parts は lib/prepare.js の parts）。何も描かない文章（空白、参照形式の定義、1 行の HTML の
// コメントだけ）の部分は高さが来ないので見ない。
export function measuredParts(parts) {
  return parts.flatMap((p, i) => (p.type === "markdown" && drawsSomething(p.text) ? [i] : []));
}

// 前後の空白は先に除いて見る（正規表現の前後に \s* を置くと、空白の長い行で時間が行の長さの 2 乗になる）。
const SILENT_LINE = /^(?:\[[^\]]+\]:\s*\S.*|<!--.*-->)?$/;

function drawsSomething(text) {
  for (let at = 0; at <= text.length;) {
    const end = text.indexOf("\n", at);
    const stop = end < 0 ? text.length : end;
    if (!SILENT_LINE.test(text.slice(at, stop).trim())) return true;
    at = stop + 1;
  }
  return false;
}
