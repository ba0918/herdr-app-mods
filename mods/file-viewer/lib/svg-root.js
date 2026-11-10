// SVG の根の要素（最初の要素の開始タグ）を読み、書かれた大きさと、表示の大きさで書き直せるかを決める（仕様の「表示の大きさで書き直す」）。
// 大きさの読み方は app（usvg 0.46.0）と同じ（ガイドの「SVG の大きさの決め方」）。

// 1 単位あたりの px（96 dpi）。
const UNIT = { "": 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 };

// 文字の大きさの既定（usvg の既定）。
const FONT_SIZE = 12;

// 数の部分は、数字の列の分け方が 1 通りになる形にする（`\d+\.?\d*` だと、長い数字の列のあとに読めない文字が続く値で後戻りが
// 二乗になり、開く道が止まる）。
const LENGTH = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(px|in|cm|mm|pt|pc|em|ex|%)?$/;

// 長さの値を { px } か { percent } にする。読めなければ null。font: em・ex に使う文字の大きさ（px）。
function length(value, font) {
  const m = value?.trim().match(LENGTH);
  if (!m) return null;
  const n = Number(m[1]), unit = m[2] ?? "";
  if (unit === "%") return { percent: n };
  if (unit === "em") return { px: n * font };
  if (unit === "ex") return { px: (n * font) / 2 };
  return { px: n * UNIT[unit] };
}

// 根の文字の大きさ（px）: style の font-size、無ければ font-size 属性を、ほかの長さと同じ読み方で読む（% は既定に対する割合、
// em・ex は既定で直す）。キーワードや読めない値は既定。
function fontSize(a) {
  const styled = a.style?.match(/(?:^|;)\s*font-size\s*:\s*([^;!]*)/i)?.[1];
  for (const value of [styled, a["font-size"]]) {
    const l = value !== undefined ? length(value, FONT_SIZE) : null;
    if (l) return l.px ?? (l.percent / 100) * FONT_SIZE;
  }
  return FONT_SIZE;
}

const SPACE = /[ \t\r\n]*/y;
const NAME = /[^\s=/>"'<]+/y;

function skipSpace(text, i) {
  SPACE.lastIndex = i;
  SPACE.test(text);
  return SPACE.lastIndex;
}

// DOCTYPE（i はその "<!" の位置）の終わりの次の位置。内部サブセット（[ ... ]）の中の > と、引用符・コメントの中は飛ばす。
// 終わらなければ -1。
function skipDoctype(text, i) {
  let depth = 0;
  for (let j = i + 2; j < text.length; j++) {
    const c = text[j];
    if (c === '"' || c === "'") {
      j = text.indexOf(c, j + 1);
      if (j < 0) return -1;
    } else if (c === "<" && text.startsWith("<!--", j)) {
      j = text.indexOf("-->", j + 4);
      if (j < 0) return -1;
      j += 2;
    } else if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ">" && depth <= 0) return j + 1;
  }
  return -1;
}

// 開始タグ（i はその "<" の位置）。{ name, start, end, attrs: [{ name, value, start, end }] }（start / end は全文の中の位置。
// 属性の start は前の空白の位置）。開始タグとして読めなければ null。
function startTag(text, i) {
  NAME.lastIndex = i + 1;
  const name = NAME.exec(text)?.[0];
  if (!name) return null;
  const attrs = [];
  let j = NAME.lastIndex;
  for (;;) {
    const before = j;
    j = skipSpace(text, j);
    if (text[j] === ">") return { name, start: i, end: j + 1, attrs };
    if (text.startsWith("/>", j)) return { name, start: i, end: j + 2, attrs };
    if (j === before) return null;
    NAME.lastIndex = j;
    const attr = NAME.exec(text)?.[0];
    if (!attr) return null;
    j = skipSpace(text, NAME.lastIndex);
    if (text[j] !== "=") return null;
    j = skipSpace(text, j + 1);
    const quote = text[j];
    if (quote !== '"' && quote !== "'") return null;
    const close = text.indexOf(quote, j + 1);
    if (close < 0) return null;
    attrs.push({ name: attr, value: text.slice(j + 1, close), start: before, end: close + 1 });
    j = close + 1;
  }
}

// 根の要素の開始タグ（startTag の形）。先頭の BOM・空白・XML 宣言・処理命令・コメント・DOCTYPE を飛ばした最初の要素。無ければ null。
function rootTag(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    i = skipSpace(text, i);
    if (text.startsWith("<?", i)) i = after(text, "?>", i + 2);
    else if (text.startsWith("<!--", i)) i = after(text, "-->", i + 4);
    else if (text.startsWith("<!", i)) i = skipDoctype(text, i);
    else return text[i] === "<" ? startTag(text, i) : null;
    if (i < 0) return null;
  }
}

// from から探した end の次の位置。無ければ -1。
function after(text, end, from) {
  const at = text.indexOf(end, from);
  return at < 0 ? -1 : at + end.length;
}

function attributes(tag) {
  const out = {};
  for (const a of tag.attrs) out[a.name] ??= a.value;
  return out;
}

// viewBox の { x, y, width, height }。読めないか、幅か高さが 0 以下なら null。
function viewBox(value) {
  const n = value?.trim().split(/\s*,\s*|\s+/).map(Number);
  if (n?.length !== 4 || n.some((v) => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return null;
  return { x: n[0], y: n[1], width: n[2], height: n[3] };
}

// 一方の側の書かれた大きさ（px）。無い側と読めない値の側は 100% として、% は viewBox のその側の割合。viewBox が無ければ決められない（null）。
function side(l, box) {
  if (l?.px !== undefined) return l.px;
  return box ? (box * (l?.percent ?? 100)) / 100 : null;
}

// 根の要素の名前の、名前空間の接頭辞を除いた部分。
const localName = (name) => name.slice(name.indexOf(":") + 1);

// <style> 要素（名前空間の接頭辞つきも。`<(?:\w[\w.-]*:)?style[\s/>]` の形）がどこかにあるかを、全文を STYLE_SLICE 文字ずつ
// 確かめるもの。step() で次の区切りを確かめ、done で終わったか、found で見つかったかを返す。コメントや文字の中のものも数える
// （タイルに分けない側に倒れるだけ）。style 属性は数えない（書かれた要素にだけ当たり、祖先の関係に左右されず、タイルの外側の svg は
// 何も設定しないので、包んでも当たり方は変わらない）。
// 6,000,000 文字を 1 度に確かめると、細工した文字列で QuickJS の 1 区間の上限（500 ms）に届くので、呼ぶ側が区切りの間に入出力の
// await を挟む（ガイドの「SVG の根の読み書きの時間」）。"<" は indexOf で探し、その後ろの名前は 1 文字ずつ読む。名前が区切りを
// またげば、続きは次の区切りで読む（1 つの区切りで読むのは、その区切りの文字と、見つかった名前の後ろの数文字まで）。
export const STYLE_SLICE = 250_000;

export function styleScanner(text) {
  let at = 0;     // 次に読む位置
  let lt = -1;    // at 以後の最初の "<" の位置（-1: 探していないか、無い）
  let open = -1;  // 名前を読んでいる途中の "<" の位置
  const scanner = {
    done: text.length === 0, found: false,
    step() {
      const end = Math.min(text.length, at + STYLE_SLICE);
      while (!scanner.done && at < end) {
        if (open < 0) {
          if (lt < at) lt = text.indexOf("<", at);
          if (lt < 0 || lt >= end) { at = lt < 0 ? text.length : end; break; }
          open = lt;
          at = lt + 1;
          if (!isWordChar(text.charCodeAt(at))) { open = -1; continue; }
        }
        while (at < end && isNameChar(text.charCodeAt(at))) at++;
        if (at === end && end < text.length) break;
        scanner.found = isStyle(text, open, at);
        scanner.done = scanner.found;
        open = -1;
      }
      if (at >= text.length) scanner.done = true;
    },
  };
  return scanner;
}

// open の "<" から end の前までの名前が、style か、接頭辞と ":" に続く style で、そのあとが名前の終わり（空白・"/"・">"）か。
function isStyle(text, open, end) {
  if (end - open === 6 && text.startsWith("style", open + 1) && styleEnd(text[end])) return true;
  return text[end] === ":" && text.startsWith("style", end + 1) && styleEnd(text[end + 6]);
}

// \w（ASCII の英数字と _）。
const isWordChar = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
// [\w.-]
const isNameChar = (c) => isWordChar(c) || c === 46 || c === 45;
const styleEnd = (c) => c !== undefined && /[\s/>]/.test(c);

// SVG の全文 text の根の要素を読む。読むのは先頭から根の開始タグまで（<style> 要素の有無は、要るときに styleScanner で区切って確かめる）。
//   { kind: "rewrite", width, height, ... }: 書かれた大きさ（px）が決まる。表示の大きさで書き直す（rewriteSvg）。
//   { kind: "asis" }: 書かれた大きさが決められない（width か height が無いか % で、viewBox も無い）。元のままコピーする。
//   { kind: "unopenable", reason }: app が描けない（根が見つからない・svg でない・書かれた大きさが 0 以下）。
export function readSvgRoot(text) {
  const tag = rootTag(text);
  if (!tag) return { kind: "unopenable", reason: "SVG として読めない" };
  if (localName(tag.name) !== "svg") return { kind: "unopenable", reason: `根の要素が svg でない（<${tag.name}>）` };
  const a = attributes(tag);
  const font = fontSize(a);
  const box = viewBox(a.viewBox);
  const width = side(length(a.width, font), box?.width), height = side(length(a.height, font), box?.height);
  if ([width, height].some((v) => v !== null && v <= 0)) return { kind: "unopenable", reason: "書かれた大きさが 0 以下" };
  if (width === null || height === null) return { kind: "asis" };
  return { kind: "rewrite", width, height, tag, viewBox: box };
}

// 書き換えで替える属性（viewBox が読めればそれは元のまま残す）。タイルで包む元の根は x・y も外す（いちばん外の svg では効かないが、
// 包まれると絵をずらす）。
const SIZE = new Set(["width", "height"]);
const RESIZED = new Set([...SIZE, "viewBox"]);
const PLACED = ["x", "y"];

const SVG_NS = "http://www.w3.org/2000/svg";

// root（readSvgRoot の "rewrite"）の SVG の全文を、width × height の絵として描く全文にする。根の要素の width・height を書き換え、
// viewBox は元のまま（無いか読めなければ書かれた大きさで足す）。ほかの属性と根の外の文字は変えない。開始タグの前・新しい開始タグ・
// 後ろをつなぐ 1 回で作る。
// tile（{ x, y, width, height }。width × height の絵の中の範囲）を渡したら、その範囲だけを描くタイルにする: 書き換えた根を、タイルの
// 大きさで viewBox がその範囲の外側の svg で包む（根の前の XML 宣言・DOCTYPE は先頭のまま、閉じるタグは文書の終わり）。元の根の
// 大きさと viewBox は全体のままなので、中の % の長さの基準も変わらない。
export function rewriteSvg(text, root, { width, height, tile = null }) {
  const tag = root.tag;
  const drop = new Set([...(root.viewBox ? SIZE : RESIZED), ...(tile ? PLACED : [])]);
  let head = ` width="${width}" height="${height}"`;
  if (!root.viewBox) head += ` viewBox="0 0 ${root.width} ${root.height}"`;
  const kept = tag.attrs.filter((a) => !drop.has(a.name)).map((a) => text.slice(a.start, a.end)).join("");
  const tail = text.slice(tag.attrs.length ? tag.attrs[tag.attrs.length - 1].end : tag.start + 1 + tag.name.length, tag.end);
  const resized = `<${tag.name}${head}${kept}${tail}`;
  if (!tile) return text.slice(0, tag.start) + resized + text.slice(tag.end);
  const outer = `<svg xmlns="${SVG_NS}" width="${tile.width}" height="${tile.height}" viewBox="${tile.x} ${tile.y} ${tile.width} ${tile.height}">`;
  return text.slice(0, tag.start) + outer + resized + text.slice(tag.end) + "</svg>";
}
