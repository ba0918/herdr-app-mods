// SVG の根の要素（最初の要素の開始タグ）を読み、書かれた大きさと、表示の大きさで書き直せるかを決める（仕様の「表示の大きさで書き直す」）。
// 大きさの読み方は app（usvg 0.46.0）と同じ（ガイドの「SVG の大きさの決め方」）。

// 1 単位あたりの px（96 dpi）。
const UNIT = { "": 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 };

// 文字の大きさの既定（usvg の既定）。
const FONT_SIZE = 12;

const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(px|in|cm|mm|pt|pc|em|ex|%)?$/;

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

// preserveAspectRatio の { x, y, slice }（x / y: 枠の余りのどこに置くか 0・0.5・1。none なら null）。読めなければ既定（xMidYMid meet）。
function aspect(value) {
  const m = value?.trim().match(/^(?:defer\s+)?(none|x(Min|Mid|Max)Y(Min|Mid|Max))(?:\s+(meet|slice))?$/);
  if (!m) return { x: 0.5, y: 0.5, slice: false };
  if (m[1] === "none") return null;
  const at = { Min: 0, Mid: 0.5, Max: 1 };
  return { x: at[m[2]], y: at[m[3]], slice: m[4] === "slice" };
}

// 一方の側の書かれた大きさ（px）。無い側と読めない値の側は 100% として、% は viewBox のその側の割合。viewBox が無ければ決められない（null）。
function side(l, box) {
  if (l?.px !== undefined) return l.px;
  return box ? (box * (l?.percent ?? 100)) / 100 : null;
}

// 根の要素の名前の、名前空間の接頭辞を除いた部分。
const localName = (name) => name.slice(name.indexOf(":") + 1);

// SVG の全文 text の根の要素を読む。
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
  return { kind: "rewrite", width, height, tag, viewBox: box, aspect: aspect(a.preserveAspectRatio) };
}

// 書き換えで替える属性（viewBox が読めればそれは元のまま残す。タイルは preserveAspectRatio も替える）。
const SIZE = new Set(["width", "height"]);
const RESIZED = new Set([...SIZE, "viewBox"]);
const TILED = new Set([...RESIZED, "preserveAspectRatio"]);

// root（readSvgRoot の "rewrite"）の SVG の全文を、width × height の絵として描く全文にする。根の要素の width・height を書き換え、
// viewBox は元のまま（無いか読めなければ書かれた大きさで足す）。tile（{ x, y, width, height }。width × height の絵の中の範囲）を渡したら、
// その範囲だけを描くタイルにする（width・height はタイルの大きさ、viewBox はその範囲に描かれる中身の範囲）。ほかの属性と根の外の
// 文字は変えない。開始タグの前・新しい開始タグ・後ろをつなぐ 1 回で作る。
export function rewriteSvg(text, root, { width, height, tile = null }) {
  const tag = root.tag, box = root.viewBox ?? { x: 0, y: 0, width: root.width, height: root.height };
  const drop = tile ? TILED : root.viewBox ? SIZE : RESIZED;
  let head = ` width="${tile?.width ?? width}" height="${tile?.height ?? height}"`;
  if (tile) {
    const v = tileBox(box, root.aspect, { width, height }, tile);
    head += ` viewBox="${v.x} ${v.y} ${v.width} ${v.height}" preserveAspectRatio="none"`;
  } else if (!root.viewBox) head += ` viewBox="${box.x} ${box.y} ${box.width} ${box.height}"`;
  const kept = tag.attrs.filter((a) => !drop.has(a.name)).map((a) => text.slice(a.start, a.end)).join("");
  const tail = text.slice(tag.attrs.length ? tag.attrs[tag.attrs.length - 1].end : tag.start + 1 + tag.name.length, tag.end);
  return text.slice(0, tag.start) + `<${tag.name}${head}${kept}${tail}` + text.slice(tag.end);
}

// 枠 frame（{ width, height }）に box（viewBox）を aspect（preserveAspectRatio）で置いたとき、枠の中の範囲 rect に描かれる中身の範囲。
function tileBox(box, aspect, frame, rect) {
  let sx = frame.width / box.width, sy = frame.height / box.height, tx = -box.x * sx, ty = -box.y * sy;
  if (aspect) {
    const s = aspect.slice ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = sy = s;
    tx = -box.x * s + aspect.x * (frame.width - box.width * s);
    ty = -box.y * s + aspect.y * (frame.height - box.height * s);
  }
  return { x: (rect.x - tx) / sx, y: (rect.y - ty) / sy, width: rect.width / sx, height: rect.height / sy };
}
