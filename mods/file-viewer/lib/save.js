// 保存する内容を作る処理: 他 machine へ書くための分割、改行の保持、文字コードの判定。

// UTF-8 のバイト数（mod の実行環境に TextEncoder が無いので自前で数える）。
// 保存のたびに数十万文字を数えるので、1 文字ごとにオブジェクトを作らない。
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

// exec の引数としての長さ。mod の exec は Windows 側で hc を起動するので、コマンドライン全体が
// UTF-16 で約 32,000 文字に収まらないと起動できない。" と \\ はエスケープで 2 文字になりうる。
export function argLength(text) {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    units += code === 0x22 || code === 0x5c ? 2 : 1;
  }
  return units;
}

// exec の 1 引数に収まるよう分ける。Linux の 1 引数の上限（UTF-8 で maxBytes）と、Windows の
// コマンドラインの上限（argLength で maxUnits）の両方を守り、サロゲートペアは切らない。
export function splitForWrite(text, maxBytes = 100_000, maxUnits = 24_000) {
  const parts = [];
  let start = 0, bytes = 0, units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const pair = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : pair ? 4 : 3;
    const width = pair ? 2 : code === 0x22 || code === 0x5c ? 2 : 1;
    if (bytes + size > maxBytes || units + width > maxUnits) {
      parts.push(text.slice(start, i));
      start = i;
      bytes = 0;
      units = 0;
    }
    bytes += size;
    units += width;
    if (pair) i++;
  }
  parts.push(text.slice(start));
  return parts;
}

// 行の差分の手間の上限。mod の非同期処理は 0.5 秒ほど続けて動くと黙って止まる（ガイドの「制約」）ので、
// ほぼ全体を書き換えた内容や、短い行が大量に並ぶ内容でも、そこまで続けない。
// 食い違いの数か比べた回数が上限を超えたら、差分の一致を使わない（行の数が同じなら位置で対応させる）。
// 共通の先頭と末尾の間の行がどちらかで MAX_LINES を超えたら、行に分けずに間の行を多いほうの改行にする。
const MAX_EDIT_DISTANCE = 1000;
const MAX_WORK = 200_000;
const MAX_LINES = 60_000;

// 改行で区切った行と、各行の後ろの改行。最後の行の後ろには改行が無いので、eols は行より 1 つ少ない。
function splitLines(text) {
  const lines = [], eols = [];
  let start = 0;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", start)) {
    const cr = i > start && text.charCodeAt(i - 1) === 13;
    lines.push(text.slice(start, cr ? i - 1 : i));
    eols.push(cr ? "\r\n" : "\n");
    start = i + 1;
  }
  lines.push(text.slice(start));
  return { lines, eols };
}

// a と b の行の対応（最長共通部分列）。match[j] は b[j] と同じとした a の行の番号、無ければ -1。
// 共通の先頭と末尾を先に外し、残りを Myers の差分で比べる。
function matchLines(a, b, maxWork) {
  const match = new Array(b.length).fill(-1);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) { match[head] = head; head++; }
  let ta = a.length, tb = b.length;
  while (ta > head && tb > head && a[ta - 1] === b[tb - 1]) { ta--; tb--; match[tb] = ta; }
  const pairs = myers(a, b, head, ta, head, tb, maxWork);
  // 行の数が同じで、同じ位置どうしの一致が差分の一致より少なくなければ（書き換えただけの編集）、位置で対応させる。
  // 同じ内容の行が並ぶと、差分は書き換えていない行を隣の同じ行と対応させることがあるため。
  if (ta - head === tb - head) {
    let same = 0;
    for (let i = head; i < ta; i++) if (a[i] === b[i]) same++;
    if (same >= pairs.length) {
      for (let i = head; i < ta; i++) if (a[i] === b[i]) match[i] = i;
      return match;
    }
  }
  for (const [i, j] of pairs) match[j] = i;
  return match;
}

// a[a0..a1) と b[b0..b1) の共通の行の組 [i, j]。手間が上限を超えれば空。
function myers(a, b, a0, a1, b0, b1, maxWork) {
  const n = a1 - a0, m = b1 - b0;
  if (n === 0 || m === 0) return [];
  const max = Math.min(n + m, MAX_EDIT_DISTANCE);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let work = 0;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) { x++; y++; work++; }
      if (++work > maxWork) return [];
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, off, d, n, m, a0, b0);
    }
  }
  return [];
}

function backtrack(trace, off, depth, n, m, a0, b0) {
  const pairs = [];
  let x = n, y = m;
  for (let d = depth; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    let prevK = 0, prevX = 0;
    if (d > 0) {
      prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
      prevX = v[off + prevK];
    }
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; pairs.push([a0 + x, b0 + y]); }
    if (d > 0) { x = prevX; y = prevY; }
  }
  return pairs;
}

// a と b の共通の先頭の長さ。文字列の比較（実行環境の中で速い）で二分探索する。
function commonPrefix(a, b) {
  let lo = 0, hi = Math.min(a.length, b.length);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (a.slice(lo, mid) === b.slice(lo, mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// a と b の、from より後ろでの共通の末尾の長さ。
function commonSuffix(a, b, from) {
  let lo = 0, hi = Math.min(a.length, b.length) - from;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (a.slice(a.length - mid, a.length - lo) === b.slice(b.length - mid, b.length - lo)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

// 文字列の中の sep の数。行ごとの処理や行ごとの文字列を作らない数え方（実行環境の中で速い）。
const countOf = (text, sep) => (text.length - text.replaceAll(sep, "").length) / sep.length;

// 読んだときの内容で多いほうの改行（同数・空なら LF）。
function majorEol(text) {
  const crlf = countOf(text, "\r\n");
  const lf = countOf(text, "\n") - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

// すべての改行を eol にする。
function toEol(text, eol) {
  const lf = text.replaceAll("\r\n", "\n");
  return eol === "\n" ? lf : lf.replaceAll("\n", eol);
}

// 行の並びで改行を当て直す。major は対応の無い行に付ける改行。
function restoreByLines(original, edited, major, maxWork) {
  const before = splitLines(original);
  const after = splitLines(edited);
  const match = matchLines(before.lines, after.lines, maxWork);
  let out = "";
  for (let j = 0; j < after.lines.length; j++) {
    out += after.lines[j];
    if (j === after.lines.length - 1) break;
    const i = match[j];
    out += i >= 0 && i < before.eols.length ? before.eols[i] : major();
  }
  return out;
}

// 読んだときの内容（original、BOM 抜き）の改行を、編集後の内容（edited）に行ごとに当て直す。
// 差分で一致した行は元の改行、それ以外の行と新しく生まれた改行は original で多いほう（同数・空なら LF）。
// 最後の行の後ろに改行を付けるかは edited のとおり。Editor が改行を CRLF で返しても LF で返しても同じ結果。
// Editor は渡した改行をそのまま返すので、まず文字のまま同じ先頭と末尾（行の境目まで）をそのまま使い、
// 行に分けて比べるのは間の部分だけにする（短い行が数十万あるファイルでも、行ごとの処理を減らすため）。
// maxWork・maxLines は差分の手間の上限（テスト用に変えられる）。
export function preserveLineEndings(original, edited, { maxWork = MAX_WORK, maxLines = MAX_LINES } = {}) {
  const head = original.lastIndexOf("\n", commonPrefix(original, edited) - 1) + 1;
  let tailA = original.length - commonSuffix(original, edited, head);
  // 共通の末尾は、どちらでも行の頭から始める（CRLF の \r と \n の間や、つないだ行の途中で切らないように）。
  if (tailA > head && (original[tailA - 1] !== "\n" || edited[edited.length - (original.length - tailA) - 1] !== "\n")) {
    const next = original.indexOf("\n", tailA);
    tailA = next < 0 ? original.length : next + 1;
  }
  const tailB = edited.length - (original.length - tailA);
  const before = original.slice(head, tailA), after = edited.slice(head, tailB);
  let major = null;
  const majorOf = () => (major ??= majorEol(original));
  const middle = countOf(before, "\n") >= maxLines || countOf(after, "\n") >= maxLines
    ? toEol(after, majorOf())
    : restoreByLines(before, after, majorOf, maxWork);
  return original.slice(0, head) + middle + original.slice(tailA);
}

const BOM = "\uFEFF";

// 読んだ内容の先頭の BOM を外す。{ bom: 有無, text: BOM 抜きの本文 }。
export function splitBom(text) {
  return text.startsWith(BOM) ? { bom: true, text: text.slice(1) } : { bom: false, text };
}

// 保存する内容。BOM 抜きの本文で改行を書き戻してから、読んだときに BOM があれば先頭に付ける。
export function contentToSave({ original, edited, bom }) {
  return (bom ? BOM : "") + preserveLineEndings(original, edited);
}

export function looksNonUtf8(text) {
  return text.includes("\uFFFD");
}
