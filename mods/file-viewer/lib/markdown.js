// Markdown の整形表示に渡す前の書き換えと、リンクを押したときの行き先。
import { basename, dirname, resolvePath } from "./path.js";

// 整形表示の部品は画像を出せないので、押せるリンクに差し替える。ローカル画像のリンクに付ける印のスキーム。
const IMAGE_SCHEME = "fv-image:";

function decode(text) {
  try { return decodeURIComponent(text); } catch { return text; }
}

// from: Markdown ファイルのパス。href: リンク先の文字列。
export function resolveLink({ from, href }) {
  if (/^https?:\/\//i.test(href)) return { type: "external", url: href };
  if (href.startsWith(IMAGE_SCHEME)) href = href.slice(IMAGE_SCHEME.length);
  else if (/^file:\/\//i.test(href)) href = href.replace(/^file:\/\/(localhost)?/i, "").replace(/^\/([a-z]:)/i, "$1");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return { type: "none" };
  const target = href.split("#")[0];
  if (target === "") return { type: "none" };
  return { type: "file", path: resolvePath(dirname(from), decode(target)) };
}

// すでにエンコードされた部分（%20 など）は一度戻してからエンコードする（二重にしない）。
function encodePath(path) {
  return encodeURI(decode(path)).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

// ---- 画像の書き換え ----
// 整形表示の部品は、ローカルの画像も http(s) の画像も描けない（ガイドの「制約」の TextView.markdown）。
// そこで画像を、押せる名前に置き換える。部品は、段落の中の HTML の <a> をただの文字で出して押せないが、
// HTML のかたまりの中の <a> は押せるリンクで出す（実機で確認）。そのため段落の中は Markdown のリンク、
// HTML のかたまりの中は <a> にする。

const DEST = String.raw`(<[^>\n]*>|[^\s)]+)`;
const TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
// 画像（インライン形式・参照形式）。1: 代替テキスト、2: インライン形式の参照先、3: 参照形式のラベル（空なら代替テキスト）。
const IMAGE_SRC = String.raw`!\[([^\]]*)\](?:\(\s*${DEST}${TITLE}\s*\)|\[([^\]]*)\]|(?![\[(]))`;
const IMAGE = new RegExp(IMAGE_SRC, "g");
// リンクに包まれた画像。1〜3: 画像、4: 外側のリンク先。
const LINKED_IMAGE = new RegExp(String.raw`\[\s*${IMAGE_SRC}\s*\]\(\s*${DEST}${TITLE}\s*\)`, "g");
const LINKED_IMG_TAG = /<a\b([^>]*)>\s*<img\b([^>]*)>\s*<\/a\s*>/gi;
const IMG_TAG = /<img\b([^>]*)>/gi;
const DEFINITION = /^ {0,3}\[([^\]]+)\]:\s*(<[^>\n]*>|\S+)/;
// HTML のかたまりの始まり（空行の次か文書の先頭で、行頭の空白 3 つまでのあとに < とタグ名か <!-- か </）。
const HTML_START = /^ {0,3}<(?:[A-Za-z][A-Za-z0-9-]*|\/[A-Za-z]|!--)/;

const normalizeLabel = (label) => label.trim().replace(/\s+/g, " ").toLowerCase();
const unwrap = (dest) => (dest.startsWith("<") ? dest.slice(1, -1) : dest);

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (whole, e) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos" || k === "#39") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    // 文字にならない値（0、サロゲート、U+10FFFF を超える値）は、HTML と同じく置き換え文字にする。
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\uFFFD" : String.fromCodePoint(code);
  });
}

// HTML の属性の値（引用符の種類と属性の順番によらない）。無ければ null。
function attr(attrs, name) {
  const m = new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))`, "i").exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : null;
}

const escapeMarkdown = (text) => text.replace(/[\\[\]]/g, "\\$&");
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Markdown のリンク先。空白や括弧を含めば <...> で包む。
const markdownDest = (href) => (/[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href);

// 画像の名前と、押したときの行き先（http(s) は URL そのもの、ローカルは fv-image: の印つき）。data: は null（書き換えない）。
function imageTarget(src, alt) {
  if (/^data:/i.test(src)) return null;
  const http = /^https?:/i.test(src);
  const name = alt || basename(http ? src.replace(/[?#].*$/, "") : src) || src;
  return { name, href: http ? src : `${IMAGE_SCHEME}${encodePath(src)}` };
}

// <img> の属性から、画像の名前と行き先（imageTarget）。src が無いか data: なら null。
function tagImage(attrs) {
  const src = attr(attrs, "src");
  return src === null ? null : imageTarget(src, attr(attrs, "alt"));
}

// 外側のリンクの行き先。同じファイル内の #見出し だけなら、画像を開く。
const outerHref = (href, image) => (href.startsWith("#") ? image.href : href);

// 画像の正規表現の一致から { src, alt }。参照形式で定義が無ければ null。
function imageSource(alt, dest, label, definitions) {
  if (dest !== undefined) return { src: unwrap(dest), alt };
  const src = definitions.get(normalizeLabel(label || alt));
  return src === undefined ? null : { src, alt };
}

// 段落の中の書き換え（Markdown のリンクにする）。
function rewriteInline(text, definitions) {
  return text
    .replace(LINKED_IMG_TAG, (whole, aAttrs, imgAttrs) => {
      const href = attr(aAttrs, "href"), image = tagImage(imgAttrs);
      if (href === null || !image) return whole;
      return `[${escapeMarkdown(image.name)}](${markdownDest(outerHref(href, image))})`;
    })
    .replace(LINKED_IMAGE, (whole, alt, dest, label, outer) => {
      const source = imageSource(alt, dest, label, definitions);
      const image = source && imageTarget(source.src, source.alt);
      if (!image) return whole;
      const href = unwrap(outer);
      return `[${escapeMarkdown(image.name)}](${href.startsWith("#") ? markdownDest(image.href) : outer})`;
    })
    .replace(IMAGE, (whole, alt, dest, label) => {
      const source = imageSource(alt, dest, label, definitions);
      const image = source && imageTarget(source.src, source.alt);
      return image ? `[${escapeMarkdown(image.name)}](${markdownDest(image.href)})` : whole;
    })
    .replace(IMG_TAG, (whole, attrs) => {
      const image = tagImage(attrs);
      return image ? `[${escapeMarkdown(image.name)}](${markdownDest(image.href)})` : whole;
    });
}

// HTML のかたまりの中の書き換え（押せる <a> にする。Markdown の書き方はここでは効かないので触らない）。
function rewriteHtml(text) {
  const link = (href, name) => `<a href="${escapeHtml(href)}">${escapeHtml(name)}</a>`;
  return text
    .replace(LINKED_IMG_TAG, (whole, aAttrs, imgAttrs) => {
      const href = attr(aAttrs, "href"), image = tagImage(imgAttrs);
      return href !== null && image ? link(outerHref(href, image), image.name) : whole;
    })
    .replace(IMG_TAG, (whole, attrs) => {
      const image = tagImage(attrs);
      return image ? link(image.href, image.name) : whole;
    });
}

// <picture> の中の <img>。部品は <picture> の中の <a> を押せるリンクにしない（実機で確認）ので、
// 画像があったことと場所を押せない文字で出す。
function rewritePictureImages(text) {
  return text.replace(IMG_TAG, (whole, attrs) => {
    const src = attr(attrs, "src");
    const image = src !== null && imageTarget(src, attr(attrs, "alt"));
    return image ? escapeHtml(`画像: ${image.name}（${src}）`) : whole;
  });
}

// <picture> の外は rewrite で、中は押せない文字で書き換える。state.picture は行をまたぐ <picture> の中か。
function aroundPictures(text, state, rewrite) {
  let out = "", rest = text;
  while (rest) {
    const mark = state.picture ? /<\/picture\s*>/i : /<picture\b[^>]*>/i;
    const m = mark.exec(rest);
    const cut = m ? m.index + m[0].length : rest.length;
    out += state.picture ? rewritePictureImages(rest.slice(0, cut)) : rewrite(rest.slice(0, cut));
    if (m) state.picture = !state.picture;
    rest = rest.slice(cut);
  }
  return out;
}

const FENCE = /^ {0,3}(```|~~~)/;

// 1 行を、書き換えてよい部分と、インラインコード・HTML のコメントの部分に分ける。state.comment は行をまたぐコメントの中か。
function segments(line, state) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (state.comment) {
      const end = line.indexOf("-->", i);
      if (end < 0) { out.push({ text: line.slice(i), keep: true }); return out; }
      out.push({ text: line.slice(i, end + 3), keep: true });
      i = end + 3;
      state.comment = false;
      continue;
    }
    const mark = /<!--|`+/g;
    mark.lastIndex = i;
    const hit = mark.exec(line);
    if (!hit) { out.push({ text: line.slice(i) }); break; }
    if (hit.index > i) out.push({ text: line.slice(i, hit.index) });
    if (hit[0] === "<!--") {
      const end = line.indexOf("-->", hit.index + 4);
      if (end < 0) { out.push({ text: line.slice(hit.index), keep: true }); state.comment = true; return out; }
      out.push({ text: line.slice(hit.index, end + 3), keep: true });
      i = end + 3;
      continue;
    }
    // インラインコード: 同じ長さの ` の並びで閉じる。閉じなければ ` はただの文字。
    const close = new RegExp(`(?<!\`)${hit[0]}(?!\`)`, "g");
    close.lastIndex = hit.index + hit[0].length;
    const end = close.exec(line);
    if (!end) { out.push({ text: hit[0] }); i = hit.index + hit[0].length; continue; }
    out.push({ text: line.slice(hit.index, end.index + hit[0].length), keep: true });
    i = end.index + hit[0].length;
  }
  return out;
}

// 文書の行を、コードブロックの外だけ、行をまたぐ HTML のコメントの状態とともに順に渡す。
// visit(line, { inHtml, state }) の戻り値で行を置き換える（コードブロックの中は渡さない）。
function eachLine(markdown, visit) {
  let fence = null, prevBlank = true, inHtml = false;
  const state = { comment: false, picture: false };
  return markdown.split("\n").map((line) => {
    const open = line.match(FENCE);
    if (fence) {
      if (open && open[1] === fence) fence = null;
      return line;
    }
    if (open && !state.comment) { fence = open[1]; inHtml = false; prevBlank = false; return line; }
    if (/^\s*$/.test(line)) { inHtml = false; prevBlank = true; return line; }
    if (prevBlank && !state.comment && HTML_START.test(line)) inHtml = true;
    prevBlank = false;
    return visit(line, { inHtml, state });
  }).join("\n");
}

// 参照形式の定義（[id]: path）を、文書全体（コードブロック・インラインコード・HTML のコメントの外）から集める。
// ラベルは大文字小文字と空白の違いを無視する。同じラベルは最初の定義。
export function collectDefinitions(markdown) {
  const definitions = new Map();
  eachLine(markdown, (line, { state }) => {
    const [first] = segments(line, state);
    const m = first && !first.keep && first.text === line ? DEFINITION.exec(line) : null;
    if (m && !definitions.has(normalizeLabel(m[1]))) definitions.set(normalizeLabel(m[1]), unwrap(m[2]));
    return line;
  });
  return definitions;
}

// 整形表示に渡す前に、画像を押せる名前に置き換える。definitions は collectDefinitions の結果
// （```mermaid で文書を分けたときは、分ける前の文書全体から集めたもの）。行の数は変えない。
export function rewriteImages(markdown, definitions = collectDefinitions(markdown)) {
  return eachLine(markdown, (line, { inHtml, state }) => segments(line, state)
    .map((part) => (part.keep ? part.text : aroundPictures(part.text, state, (text) => (inHtml ? rewriteHtml(text) : rewriteInline(text, definitions)))))
    .join(""));
}

// 整形表示の部品の中に図を埋め込めないので、Markdown を ```mermaid ブロックの境目で区切る。
// 図の部分には、中身と、中身の 1 行目のファイル全体での行番号（1 から）と、元のブロック全体を付ける。
export function splitMermaidBlocks(markdown) {
  const lines = markdown.split("\n");
  const parts = [];
  let text = [];
  const flush = () => { parts.push({ type: "markdown", text: text.join("\n") }); text = []; };
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/);
    if (!open) { text.push(lines[i]); continue; }
    const fence = open[1];
    const closes = (line) => new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`).test(line);
    let end = i + 1;
    while (end < lines.length && !closes(lines[end])) end++;
    if (end >= lines.length || open[2].toLowerCase() !== "mermaid") {
      // 閉じていないブロックと、ほかの言語のブロックは文章のまま（中は読み飛ばす）。
      text.push(...lines.slice(i, Math.min(end + 1, lines.length)));
      i = end;
      continue;
    }
    flush();
    parts.push({ type: "mermaid", source: lines.slice(i + 1, end).join("\n"), firstLine: i + 2, fence: lines.slice(i, end + 1).join("\n") });
    i = end;
  }
  flush();
  return parts;
}
