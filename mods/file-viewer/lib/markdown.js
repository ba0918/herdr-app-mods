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
// ファイル名の # と ? もエンコードする（resolveLink が # 以降を見出しとして除くため）。
function encodePath(path) {
  return encodeURI(decode(path)).replace(/[()#?]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// ---- 画像の書き換え ----
// 整形表示の部品は、ローカルの画像も http(s) の画像も描けない（ガイドの「制約」の TextView.markdown）。
// そこで画像を、押せる名前に置き換える。部品は、段落の中の HTML の <a> をただの文字で出して押せないが、
// HTML のかたまりの中の <a> は押せるリンクで出す（実機で確認）。そのため段落の中は Markdown のリンク、
// HTML のかたまりの中は <a> にする。

// リンク先（<...> か、空白を含まない並び。対になった括弧は 1 段まで中に含める）。
const DEST = String.raw`(<[^>\n]*>|(?:[^\s()]|\([^\s()]*\))+)`;
const TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
// 画像（インライン形式・参照形式）。1: 代替テキスト、2: インライン形式の参照先、3: 参照形式のラベル（空なら代替テキスト）。
const IMAGE_SRC = String.raw`!\[([^\]]*)\](?:\(\s*${DEST}${TITLE}\s*\)|\[([^\]]*)\]|(?![\[(]))`;
const IMAGE = new RegExp(IMAGE_SRC, "g");
// Markdown のリンクに包まれた画像（Markdown の画像か <img>）。1〜3: Markdown の画像、4: <img> の属性、
// 5: 外側のインライン形式のリンク先、6: 外側の参照形式のラベル（ラベルは [ ] を含められないので、省略形は無い）。
const LINKED_IMAGE = new RegExp(String.raw`\[\s*(?:${IMAGE_SRC}|<img\b([^>]*)>)\s*\](?:\(\s*${DEST}${TITLE}\s*\)|\[([^\]]+)\])`, "g");
const LINKED_IMG_TAG = /<a\b([^>]*)>\s*<img\b([^>]*)>\s*<\/a\s*>/gi;
const IMG_TAG = /<img\b([^>]*)>/gi;
const DEFINITION = /^ {0,3}\[([^\]]+)\]:\s*(<[^>\n]*>|\S+)/;

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
// literal: <...> で包んだ参照先か。包んでいなければ、ローカルの # 以降は見出しとして除く。
function imageTarget(src, alt, literal = false) {
  if (/^data:/i.test(src)) return null;
  const http = /^https?:/i.test(src);
  const path = http || literal ? src : src.replace(/#.*$/, "");
  const name = alt || basename(http ? src.replace(/[?#].*$/, "") : path) || src;
  return { name, href: http ? src : `${IMAGE_SCHEME}${encodePath(path)}` };
}

// <img> の属性から、画像の名前と行き先（imageTarget）。src が無いか data: なら null。
function tagImage(attrs) {
  const src = attr(attrs, "src");
  return src === null ? null : imageTarget(src, attr(attrs, "alt"));
}

// 外側のリンクの行き先。同じファイル内の #見出し だけなら、画像を開く。
const outerHref = (href, image) => (href.startsWith("#") ? image.href : href);

// 画像の正規表現の一致から、画像の名前と行き先（imageTarget）。参照形式で定義が無ければ null。
function imageSource(alt, dest, label, definitions) {
  dest ??= definitions.get(normalizeLabel(label || alt));
  return dest === undefined ? null : imageTarget(unwrap(dest), alt, dest.startsWith("<"));
}

// 段落の中の書き換え（Markdown のリンクにする）。
function rewriteInline(text, definitions) {
  return text
    .replace(LINKED_IMG_TAG, (whole, aAttrs, imgAttrs) => {
      const href = attr(aAttrs, "href"), image = tagImage(imgAttrs);
      if (href === null || !image) return whole;
      return `[${escapeMarkdown(image.name)}](${markdownDest(outerHref(href, image))})`;
    })
    .replace(LINKED_IMAGE, (whole, alt, dest, label, imgAttrs, outerDest, outerLabel) => {
      const image = imgAttrs === undefined ? imageSource(alt, dest, label, definitions) : tagImage(imgAttrs);
      const outer = outerDest ?? definitions.get(normalizeLabel(outerLabel));
      if (!image || outer === undefined) return whole;
      return `[${escapeMarkdown(image.name)}](${markdownDest(outerHref(unwrap(outer), image))})`;
    })
    .replace(IMAGE, (whole, alt, dest, label) => {
      const image = imageSource(alt, dest, label, definitions);
      return image ? `[${escapeMarkdown(image.name)}](${markdownDest(image.href)})` : whole;
    })
    .replace(IMG_TAG, (whole, attrs) => {
      const image = tagImage(attrs);
      return image ? `[${escapeMarkdown(image.name)}](${markdownDest(image.href)})` : whole;
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

// HTML のかたまりの中の書き換え（押せる <a> にする。Markdown の書き方はここでは効かないので触らない）。
// parts は segments の結果。開いている <a href> の中の <img> は名前だけにして、外側の <a> を押せるリンクに残す
// （外側の行き先が同じファイル内の #見出し だけなら、その <a> の行き先を最初の画像にする）。<picture> の中は押せない文字。
const HTML_TOKEN = /<a\b([^>]*)>|<\/a\s*>|<(\/?)picture\b[^>]*>|<img\b([^>]*)>/gi;
function rewriteHtmlBlock(parts, state) {
  const out = [];
  let anchor = null; // { href, at: out の中の開きタグの位置 }
  for (const part of parts) {
    if (part.keep) { out.push(part.text); continue; }
    let i = 0;
    for (const m of part.text.matchAll(HTML_TOKEN)) {
      out.push(part.text.slice(i, m.index));
      i = m.index + m[0].length;
      const [tag, aAttrs, pictureClose, imgAttrs] = m;
      if (imgAttrs === undefined) {
        out.push(tag);
        if (aAttrs !== undefined) {
          const href = attr(aAttrs, "href");
          anchor = href === null ? null : { href, at: out.length - 1 };
        } else if (pictureClose !== undefined) state.picture = pictureClose === "";
        else anchor = null;
        continue;
      }
      const image = tagImage(imgAttrs);
      if (!image) out.push(tag);
      else if (state.picture) out.push(rewritePictureImages(tag));
      else if (!anchor) out.push(`<a href="${escapeHtml(image.href)}">${escapeHtml(image.name)}</a>`);
      else {
        out.push(escapeHtml(image.name));
        if (anchor.href.startsWith("#")) {
          out[anchor.at] = `<a href="${escapeHtml(image.href)}">`;
          anchor.href = image.href;
        }
      }
    }
    out.push(part.text.slice(i));
  }
  return out.join("");
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

// ---- 文書のかたまり ----
// CommonMark にならい、行を、コードブロック（フェンスと、4 つ以上の空白で下げた形）、HTML のかたまり、文章に分ける。

const FENCE_OPEN = /^( *)(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^( *)(`{3,}|~{3,})\s*$/;
const ATX_HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}\s*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/;
const LIST_MARKER = /^\s*(?:[-+*]|\d{1,9}[.)])(?:\s|$)/;

// HTML のかたまりの始まり（CommonMark の HTML ブロック）。行頭の空白は 3 つまで。
// コメント（<!-- で始まり、--> のある行で終わる）と、ブロックのタグ（段落の途中でも始まる）は空行まで。
const HTML_COMMENT_START = /^ {0,3}<!--/;
const HTML_BLOCK_TAG = new RegExp(String.raw`^ {0,3}<\/?(?:${[
  "address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col", "colgroup", "dd", "details",
  "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "frame", "frameset", "h[1-6]", "head",
  "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option",
  "p", "param", "search", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul",
].join("|")})(?=\s|\/?>|$)`, "i");
// それ以外のタグは、1 つの完全な開きタグか閉じタグだけの行で、段落の続きでないときだけ始まる（空行まで）。
const HTML_OPEN_TAG = String.raw`<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>\x60]+|'[^']*'|"[^"]*"))?)*\s*\/?>`;
const HTML_LONE_TAG = new RegExp(String.raw`^ {0,3}(?:${HTML_OPEN_TAG}|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$`);

// HTML のかたまりが始まる行なら { end }（end: 終わりの行の印。null なら空行まで）、始まらなければ null。
// paragraph: 段落の続きを受ける行の次か。
function htmlStart(line, paragraph) {
  if (HTML_COMMENT_START.test(line)) return { end: /-->/, first: line.slice(line.indexOf("<!--") + 4) };
  if (HTML_BLOCK_TAG.test(line) || (!paragraph && HTML_LONE_TAG.test(line))) return { end: null };
  return null;
}

// フェンスの始まり。{ char, length, info, maxIndent } か null。` のフェンスの言語の欄に ` があればフェンスではない。
// maxIndent は行頭の空白の上限（閉じる行にも使う）。
function fenceOpen(line, maxIndent = 3) {
  const m = FENCE_OPEN.exec(line);
  if (!m || m[1].length > maxIndent || (m[2][0] === "`" && m[3].includes("`"))) return null;
  return { char: m[2][0], length: m[2].length, info: m[3].trim().split(/\s+/)[0], maxIndent };
}

// フェンスを閉じる行か。開いた並びと同じ文字で、同じ長さ以上の並びのあとに空白しか無い行だけが閉じる。
function closesFence(line, fence) {
  const m = FENCE_CLOSE.exec(line);
  return Boolean(m) && m[1].length <= fence.maxIndent && m[2][0] === fence.char && m[2].length >= fence.length;
}

// 行頭の空白の幅（タブは 4 の倍数の位置まで）。
function indentOf(line) {
  let width = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " ") width++;
    else if (line[i] === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

// 文書の行を、かたまり { kind, lines } の並びに分ける。kind: "code"（書き換えない）・"html"・"text"・"blank"。
// 文章のかたまりは段落の単位（見出し・区切りの線・リストの項目の行で新しく始める）で、インラインコードはその中でだけ閉じる。
function blocksOf(markdown) {
  const blocks = [];
  // paragraph: 直前の行が段落の続きを受ける行か。list: リストの中か（下げた行をコードブロックにしない）。blank: 直前が空行か文書の先頭か。
  // html: 続いている HTML のかたまり（htmlStart の戻り値）。
  let fence = null, indented = false, html = null, paragraph = false, list = false, blank = true;
  const add = (kind, line, fresh = false) => {
    const last = blocks[blocks.length - 1];
    if (!fresh && last?.kind === kind) last.lines.push(line);
    else blocks.push({ kind, lines: [line] });
  };
  for (const line of markdown.split("\n")) {
    if (fence) {
      add("code", line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (html?.end) {
      add("html", line);
      if (html.end.test(line)) html = null;
      continue;
    }
    if (/^\s*$/.test(line)) {
      add("blank", line);
      html = null; paragraph = false; blank = true;
      continue;
    }
    const indent = indentOf(line);
    if (indented && indent >= 4) { add("code", line); blank = false; continue; }
    indented = false;
    if (html) { add("html", line); continue; }
    const marker = LIST_MARKER.test(line) && !THEMATIC_BREAK.test(line);
    if (list && blank && indent < 2 && !marker) list = false;
    const open = fenceOpen(line, list ? Infinity : 3);
    const start = open ? null : htmlStart(line, paragraph);
    if (open) {
      fence = open;
      add("code", line, true);
    } else if (!list && !paragraph && indent >= 4) {
      indented = true;
      add("code", line, true);
    } else if (start) {
      html = start.end && start.end.test(start.first) ? null : start;
      add("html", line, true);
    } else if (paragraph && SETEXT_UNDERLINE.test(line)) {
      add("text", line);
    } else if (ATX_HEADING.test(line) || THEMATIC_BREAK.test(line)) {
      add("text", line, true);
    } else {
      if (marker) list = true;
      add("text", line, marker || !paragraph);
      paragraph = true;
      blank = false;
      continue;
    }
    paragraph = false;
    blank = false;
  }
  return blocks;
}

// 文書を、かたまりごとに visit(text, kind, state) で書き換えてつなぐ（"html" と "text" のかたまりだけ渡す）。
// state.comment は HTML のコメントの中か、state.picture は <picture> の中か（どちらもかたまりをまたぐ）。
function mapBlocks(markdown, visit) {
  const state = { comment: false, picture: false };
  return blocksOf(markdown).map(({ kind, lines }) => {
    const text = lines.join("\n");
    return kind === "html" || kind === "text" ? visit(text, kind, state) : text;
  }).join("\n");
}

// かたまりの文字列を、書き換えてよい部分と、インラインコード・HTML のコメントの部分（keep）に分ける。
function segments(text, state) {
  const out = [];
  const push = (part, keep = false) => {
    const last = out[out.length - 1];
    if (!keep && last && !last.keep) last.text += part;
    else out.push(keep ? { text: part, keep } : { text: part });
  };
  // 後ろに閉じる並びが無いと分かった ` の並びの長さ（同じ長さを何度も探さない）。
  const unclosed = new Set();
  const mark = /<!--|`+/g;
  let i = 0;
  while (i < text.length) {
    if (state.comment) {
      const end = text.indexOf("-->", i);
      if (end < 0) { push(text.slice(i), true); return out; }
      push(text.slice(i, end + 3), true);
      i = end + 3;
      state.comment = false;
      continue;
    }
    mark.lastIndex = i;
    const hit = mark.exec(text);
    if (!hit) { push(text.slice(i)); break; }
    if (hit.index > i) push(text.slice(i, hit.index));
    if (hit[0] === "<!--") {
      const end = text.indexOf("-->", hit.index + 4);
      if (end < 0) { push(text.slice(hit.index), true); state.comment = true; return out; }
      push(text.slice(hit.index, end + 3), true);
      i = end + 3;
      continue;
    }
    // インラインコード: 同じ長さの ` の並びで閉じる（改行をまたいでよい）。閉じなければ ` はただの文字。
    const n = hit[0].length, from = hit.index + n;
    let end = null;
    if (!unclosed.has(n)) {
      const close = new RegExp(`(?<!\`)\`{${n}}(?!\`)`, "g");
      close.lastIndex = from;
      end = close.exec(text);
      if (!end) unclosed.add(n);
    }
    if (!end) { push(hit[0]); i = from; continue; }
    push(text.slice(hit.index, end.index + n), true);
    i = end.index + n;
  }
  return out;
}

// 参照形式の定義（[id]: path）を、文書全体（コードブロック・インラインコード・HTML のコメントの外）から集める。
// ラベルは大文字小文字と空白の違いを無視する。同じラベルは最初の定義。値は書いたままの参照先（<...> を含む）。
export function collectDefinitions(markdown) {
  const definitions = new Map();
  mapBlocks(markdown, (text, kind, state) => {
    const parts = segments(text, state);
    if (kind !== "text") return text;
    // インラインコードやコメントにかからない行だけを見る。
    const kept = [];
    let at = 0;
    for (const part of parts) {
      if (part.keep) kept.push([at, at + part.text.length]);
      at += part.text.length;
    }
    let start = 0, k = 0;
    for (const line of text.split("\n")) {
      const end = start + line.length;
      while (k < kept.length && kept[k][1] <= start) k++;
      const m = k < kept.length && kept[k][0] < end ? null : DEFINITION.exec(line);
      if (m && !definitions.has(normalizeLabel(m[1]))) definitions.set(normalizeLabel(m[1]), m[2]);
      start = end + 1;
    }
    return text;
  });
  return definitions;
}

// 整形表示に渡す前に、画像を押せる名前に置き換える。definitions は collectDefinitions の結果
// （```mermaid で文書を分けたときは、分ける前の文書全体から集めたもの）。行をまたぐ書き方を 1 行にまとめるので、
// 行の数は変わりうる（図の行番号は、分けたときの元の Markdown で数える）。
export function rewriteImages(markdown, definitions = collectDefinitions(markdown)) {
  return mapBlocks(markdown, (text, kind, state) => {
    const parts = segments(text, state);
    if (kind === "html") return rewriteHtmlBlock(parts, state);
    return parts.map((part) => (part.keep ? part.text : aroundPictures(part.text, state, (t) => rewriteInline(t, definitions)))).join("");
  });
}

// 整形表示の部品の中に図を埋め込めないので、Markdown を ```mermaid ブロックの境目で区切る。
// 図の部分には、中身と、中身の 1 行目のファイル全体での行番号（1 から）と、元のブロック全体を付ける。
export function splitMermaidBlocks(markdown) {
  const lines = markdown.split("\n");
  const parts = [];
  let text = [];
  const flush = () => { parts.push({ type: "markdown", text: text.join("\n") }); text = []; };
  for (let i = 0; i < lines.length; i++) {
    const open = fenceOpen(lines[i]);
    if (!open) { text.push(lines[i]); continue; }
    let end = i + 1;
    while (end < lines.length && !closesFence(lines[end], open)) end++;
    if (end >= lines.length || open.info.toLowerCase() !== "mermaid") {
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
