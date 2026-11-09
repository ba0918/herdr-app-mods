// 整形表示の本文のスクロールの位置。app の部品のスクロールの位置は、タブを表示していない間に消える（ガイドの「制約」の
// 「表示していない間の部品の状態」）ので、位置はタブのコピーが持ち、本文をその分だけ上にずらして出す。
//
// 作り直された整形表示の部品（TextView）は、中身を描くまでの数フレームのあいだ高さが 0 になり、本文が短く見える（タブの表示に
// 戻ったときも、ソース表示や待つ間から入ったときも）。その間（縮んでいる間）は位置を本文の長さに収めずに出し、部品が中身を
// 描いたフレームで、もとの位置に描かれるようにする。縮んでいるかは、文章の部分（中身のある Markdown）の高さで見る。
// 何も描かない部分（参照形式の定義だけなど）は高さ 0 のままなので、縮んでから一定の時間待っても高さが来なければ、
// 待つのをやめて（expire）その部分は数えない。縮むのは、部品を作り直したとき（fresh）・中身が差し替わって部分が変わったとき・
// 描いていた部分の高さが 0 に戻ったときのどれでもあり、どれも同じように待つのをやめる。
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
    // 今の縮んでいる間が始まった時刻（ms）。縮んでいなければ null。
    this.since = null;
  }

  // 本文の部分の並び。indexes: 高さを見る文章の部分の番号。fresh: 部品を作り直した（高さを分からないことにする）。
  expect(indexes, now, { fresh = false } = {}) {
    this.parts = indexes;
    if (fresh) {
      this.heights = new Map();
      this.ignored = new Set();
      this.since = null;
    }
    this.track(now);
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

  // 縮んでから limit ms 待っても高さの来ない部分があれば、その部分を数えるのをやめる。やめたら true。
  expire(now, limit) {
    this.track(now);
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

  // スクロールバーのつまみの長さ（px）。track: 溝の長さ。min: 下限（溝より長くはしない）。
  thumb(track, min) {
    const ratio = this.content > 0 ? Math.min(1, this.view / this.content) : 1;
    return Math.min(track, Math.max(min, Math.round(track * ratio)));
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

  // 縮んでいる間の始まりを覚える（時刻を受け取らない partSized で縮んだときは、次の expect か expire の時刻から数える）。
  track(now) {
    if (!this.collapsed) this.since = null;
    else this.since ??= now;
  }

  changes(update) {
    const shown = this.shown(), collapsed = this.collapsed;
    update();
    if (!this.collapsed) this.since = null;
    return this.shown() !== shown || this.collapsed !== collapsed;
  }
}

// スクロールバーを出しているか。app のスクロールバーに合わせ、スクロールしてから keepMs のあいだ出し、つまみにマウスを
// 載せている間は出したままにする。時刻は ms。
export class BarShow {
  constructor(keepMs) {
    this.keepMs = keepMs;
    this.until = null;
    this.hovered = false;
  }

  scrolled(now) {
    this.until = now + this.keepMs;
  }

  hover(hovered) {
    this.hovered = hovered;
  }

  shown(now) {
    return this.hovered || this.remaining(now) !== null;
  }

  // 時間で消えるまでの残り（ms）。時間では出ていなければ null。
  remaining(now) {
    return this.until !== null && now < this.until ? this.until - now : null;
  }
}

// 整形表示の本文で mod が覚えている操作の印: スクロールバーの帯の上のマウス、本文の中で押している左ボタンと端の帯の向き・深さ、
// 本文をスクロールし続ける非同期処理（drag）と部品が中身を描くのを見る非同期処理（watch）、スクロールバーの出し入れ（bar）。
// 印を付けた知らせと対になる知らせ（on_hover(false)、mouse up、非同期処理の finally）は、いつも届くとは限らない。要素が
// 描かれなくなったとき、タブを表示していない間（render も呼ばれない。ガイドの「制約」の「表示していない間の部品の状態」）、
// 非同期処理が黙って止まったとき（同じく「長い同期処理」）は来ない。そこで印は、描画のたびに frame と showBar で今の描画に
// 合わせて解き、タブが隠れたことにタイマーで気づいたときにも reset で解き、非同期処理は最後に進んだ時刻で見る（Lease）。時刻は ms。
export class BodyInput {
  constructor({ keepMs, staleMs }) {
    this.bar = new BarShow(keepMs);
    // スクロールバーの帯の上のマウスの y（帯の中の位置、px）。帯の上に無ければ null。
    this.pointer = null;
    // 左ボタンを本文の中で押している。dir: 上下の端の帯にいれば -1（上）/ 1（下）。depth: 帯の中の深さ（0〜1）。
    this.pressed = false;
    this.dir = 0;
    this.depth = 0;
    this.drag = new Lease(staleMs);
    this.watch = new Lease(staleMs);
    // 前の描画でスクロールバーを描いたか。
    this.barDrawn = false;
  }

  // 描画のたびに、本文の場所に出すものを決めたところで呼ぶ。returned: タブの表示に戻った最初の描画。formatted: 整形表示を出す。
  // タブに戻ったときと整形表示を出さないときは、印をすべて解き、非同期処理を手放す（手放した処理は次の歩で止まる）。
  frame({ returned, formatted }) {
    if (returned || !formatted) this.reset();
  }

  // このフレームでスクロールバーを描くか。span: つまみの帯の中の位置 { top, length }（px）。スクロールできなければ null。
  // つまみにマウスが載っているかは、覚えているマウスの位置と今のつまみの位置で決め直す。描かないなら、帯の上のマウスの位置は
  // 消す（帯が無ければ、離れた知らせも来ない）。
  showBar(now, span) {
    this.bar.hover(this.onThumb(span));
    this.barDrawn = span !== null && this.bar.shown(now);
    if (!this.barDrawn) this.pointer = null;
    return this.barDrawn;
  }

  onThumb(span) {
    return span !== null && this.pointer !== null && this.pointer >= span.top && this.pointer <= span.top + span.length;
  }

  // 帯の上のマウスの位置（離れたら null）。
  pointerAt(y) {
    this.pointer = y;
  }

  release() {
    this.pressed = false;
    this.dir = 0;
  }

  reset() {
    this.pointer = null;
    this.barDrawn = false;
    this.bar.hover(false);
    this.release();
    this.drag.end();
    this.watch.end();
  }
}

// 非同期の繰り返し 1 本を動かしてよい持ち主。黙って止まった繰り返しは finally を動かさないので、動いているかは最後に進んだ
// 時刻で見て、staleMs のあいだ進んでいなければ止まったと見なし、次の take で新しい持ち主に替える（古い繰り返しが動き出しても、
// 次の step で止まる）。key: 何のための繰り返しか（違う key の take は、動いている持ち主も替える）。
export class Lease {
  constructor(staleMs) {
    this.staleMs = staleMs;
    this.owner = null;
    this.at = 0;
  }

  // 同じ key で動いている繰り返しが無ければ、新しい持ち主を返す。あれば null。
  take(key, now) {
    if (this.owner?.key === key && now - this.at < this.staleMs) return null;
    this.at = now;
    return (this.owner = { key });
  }

  // 持ち主の繰り返しが 1 歩進む。持ち主でなくなっていれば false（止める）。
  step(owner, now) {
    if (this.owner !== owner) return false;
    this.at = now;
    return true;
  }

  // 手放す（owner を渡せば、その持ち主のときだけ）。
  end(owner = this.owner) {
    if (this.owner === owner) this.owner = null;
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
