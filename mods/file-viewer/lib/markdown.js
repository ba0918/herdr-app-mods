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

// タグの属性の並び（タグ名のあとから > の前まで）。= のあとの引用符で囲んだ値の中の > ではタグは終わらない
// （HTML と同じく、引用符は値の始まりでだけ囲みになる）。引用符の外に < があればタグとしない（CommonMark の HTML のタグと同じ。
// 閉じない <img が並ぶ文で、試すたびに末尾まで読まないため）。
const ATTRS = String.raw`(?:[^<>=]|=\s*"[^"]*"|=\s*'[^']*'|=(?!\s*["']))*`;
// リンク先（<...> か、空白を含まない並び。対になった括弧は 1 段まで中に含める）。インラインコードやコメントの文字（mask の KEEP）は
// 含めない（行き先にしない）。
const DEST = String.raw`(<[^>\n\uE000]*>|(?:[^\s()\uE000]|\([^\s()\uE000]*\))+)`;
// タイトル。( ) で囲むときは、中に \ で打ち消していない ( と ) を含まない（CommonMark と同じ。閉じない ( が並ぶ文で、
// 試すたびに末尾まで読まない）。
const TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\((?:\\.|[^\\()])*\)))?`;
// 画像（インライン形式・参照形式）。1: 代替テキスト、2: インライン形式の参照先、3: 参照形式のラベル（空なら代替テキスト）。
// 代替テキストは [ と ] を含まない（LINK_TEXT の中の画像と同じ。閉じない ![ が並ぶ文で、試すたびに末尾まで読まない）。
const IMAGE_SRC = String.raw`!\[([^\[\]]*)\](?:\(\s*${DEST}${TITLE}\s*\)|\[([^\]]*)\]|(?![\[(]))`;
const IMAGE = new RegExp(IMAGE_SRC, "g");
const IMG_TAG = new RegExp(String.raw`<img\b(${ATTRS})>`, "gi");
// 画像（Markdown の画像か <img>）か、\ で打ち消した文字か、[ か ]。1〜3: Markdown の画像（IMAGE と同じ）、4: <img> の属性、
// 5: \ で打ち消した文字。
const IMAGE_OR_BRACKET = new RegExp(String.raw`${IMAGE_SRC}|<img\b(${ATTRS})>|(\\.)|[\[\]]`, "gi");
// Markdown のリンク（中の文字に画像を含みうる）。1: リンクの文字、2: インライン形式のリンク先、3: 参照形式のラベル
// （ラベルは [ ] を含められないので、省略形は無い）。画像の ![ の [ や、\ で打ち消した [ からは始めない。
// リンクの文字の並びは、どの文字でも当てはまり方が 1 つになるように分けている（閉じないときに試し直しが増えない）。
const LINK_TEXT = String.raw`(?:\\.|[^\[\]\\!<]|!(?!\[)|!\[[^\[\]]*\](?:\[[^\[\]]*\])?|<(?!img\b)|<img\b${ATTRS}>)*`;
const LINK = new RegExp(String.raw`(?<![!\\])\[(${LINK_TEXT})\](?:\(\s*${DEST}${TITLE}\s*\)|\[([^\]]+)\])`, "gi");
// 段落の中の <a href> と、その中身（入れ子の <a> は含めない）。1: <a> の属性、2: 中身。
const ANCHOR = new RegExp(String.raw`<a\b(${ATTRS})>([^<]*(?:<(?!\/?a\b)[^<]*)*)<\/a\s*>`, "gi");
// 参照形式の定義（CommonMark の link reference definition）。1: ラベル、2: 参照先。参照先の前とタイトルの前では 1 回まで
// 改行（LF か CRLF）してよい。タイトルの後ろに空白でないものがあれば、タイトルの無い定義（タイトルの行は段落の文字）。
const DEFINITION = new RegExp(String.raw`[ \t]*\[((?:\\.|[^\\\[\]])+)\]:[ \t]*(?:\r?\n[ \t]*)?(<[^<>\n]*>|[^\s<]\S*)` +
  String.raw`(?:(?:[ \t]+(?:\r?\n[ \t]*)?|\r?\n[ \t]*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^()\\])*\)))?[ \t]*\r?(?:\n|$)`, "y");

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

// re（g つき）の text の中の一致をすべて。app の QuickJS は matchAll のたびに正規表現を作り直して遅い（ガイドの「制約」）ので、
// exec で集める。先に全部集めるので、呼び出し側が同じ正規表現をまた使っても lastIndex は崩れない。
function matchesOf(text, re) {
  if (!re.global) throw new TypeError("matchesOf には g つきの正規表現を渡す");
  const out = [];
  re.lastIndex = 0;
  for (let m; (m = re.exec(text));) {
    out.push(m);
    if (m[0] === "") re.lastIndex++;
  }
  return out;
}
const KEEP_RUNS = /\uE000+|[^\uE000]+/g;

// ---- 書いたまま残す部分 ----
// 段落の中のインラインコードと HTML のコメントは書いたまま残すが、リンクの文字の中にあっても、リンクを 1 つのまとまりとして見る。
// そこで段落を { text, mask } の組で持つ。text は書いたままの文字列。mask は同じ長さで、コードとコメントの文字を KEEP に、
// もとからある KEEP の文字を OTHER に変えたもの（KEEP はコードとコメントの位置だけを指す）。正規表現は mask に当て、値と出力は
// text の同じ位置から切り出す。mask の文字は出力に入らず、文書の私用領域の文字もほかの文字と同じに扱う。
const KEEP = "\uE000", OTHER = "\uE001";
// コードもコメントも含まない文字列（書き換えで作った文字列など）の組。
const plain = (text) => ({ text, mask: text.includes(KEEP) ? text.replace(/\uE000/g, OTHER) : text });
const sliceOf = (s, start, end) => ({ text: s.text.slice(start, end), mask: s.mask.slice(start, end) });
const join = (pieces) => ({ text: pieces.map((p) => p.text).join(""), mask: pieces.map((p) => p.mask).join("") });
const hasKeep = (s, start, end) => s.mask.slice(start, end).includes(KEEP);

// segments の結果から組を作る。
function pairOf(parts) {
  return join(parts.map((part) => (part.keep ? { text: part.text, mask: KEEP.repeat(part.text.length) } : plain(part.text))));
}

// s の start〜end を、コードとコメントの外だけ fn で変えた組（コードとコメントは書いたまま）。
function render(s, start, end, fn) {
  if (!hasKeep(s, start, end)) return plain(fn(s.text.slice(start, end)));
  const pieces = [];
  for (const m of matchesOf(s.mask.slice(start, end), KEEP_RUNS)) {
    const run = sliceOf(s, start + m.index, start + m.index + m[0].length);
    pieces.push(m[0][0] === KEEP ? run : plain(fn(run.text)));
  }
  return join(pieces);
}

// s の mask に re（g つき）を当てて置き換えた組。fn(m, at) は置き換える組（plain や render で作る）か、書いたまま残すなら null。
function replaceIn(s, re, fn) {
  const pieces = [];
  let i = 0;
  for (const m of matchesOf(s.mask, re)) {
    const piece = fn(m, m.index);
    if (!piece) continue;
    pieces.push(sliceOf(s, i, m.index), piece);
    i = m.index + m[0].length;
  }
  if (!pieces.length) return s;
  pieces.push(sliceOf(s, i, s.text.length));
  return join(pieces);
}

// 前後の空白を除いた組（コードとコメントは空白で始まりも終わりもしない）。
function trimmed(s) {
  const start = s.mask.length - s.mask.trimStart().length;
  return sliceOf(s, start, Math.max(start, s.mask.trimEnd().length));
}

const SPACE = /\s*/y;
// text の i から続く空白の後ろの位置。
function spaceEnd(text, i) {
  SPACE.lastIndex = i;
  SPACE.exec(text);
  return SPACE.lastIndex;
}

// HTML の属性の値（引用符の種類と属性の順番によらない）。1〜3: 値（"..."・'...'・引用符なし）。
const ATTR_VALUE = Object.fromEntries(["src", "alt", "href"].map((name) =>
  [name, new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))`, "i")]));
const attrValue = (name) => ATTR_VALUE[name];
// 文字列の属性の並びから、値（文字参照を戻したもの）。無ければ null。
function attr(attrs, name) {
  const m = attrValue(name).exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : null;
}
// 組 s の at から始まる属性の並び（attrs は mask の側）から、値の位置 { start, end }。無ければ null。
function attrAt(s, at, attrs, name) {
  const m = attrValue(name).exec(attrs);
  if (!m) return null;
  const end = at + m.index + m[0].length - (m[3] === undefined ? 1 : 0);
  return { start: end - (m[1] ?? m[2] ?? m[3]).length, end };
}

const escapeMarkdown = (text) => text.replace(/[\\[\]]/g, "\\$&");
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Markdown のリンク先。空白や括弧を含めば <...> で包む。
const markdownDest = (href) => (/[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href);

// 画像の参照先から、押したときの行き先（http(s) は URL そのもの、ローカルは fv-image: の印つき）と、名前が無いときの名前（file）。
// data: は null（書き換えない）。literal: <...> で包んだ参照先か。包んでいなければ、ローカルの # 以降は見出しとして除く。
function imageTarget(src, literal = false) {
  if (/^data:/i.test(src)) return null;
  const http = /^https?:/i.test(src);
  const path = http || literal ? src : src.replace(/#.*$/, "");
  return { src, file: basename(http ? src.replace(/[?#].*$/, "") : path) || src, href: http ? src : `${IMAGE_SCHEME}${encodePath(path)}` };
}

// HTML のかたまりの中の <img> の属性から、行き先（imageTarget）と名前（alt、無ければファイル名）。src が無いか data: なら null。
function tagImage(attrs) {
  const src = attr(attrs, "src");
  const target = src === null ? null : imageTarget(src);
  return target && { href: target.href, name: attr(attrs, "alt") || target.file };
}

// 外側のリンクの行き先。同じファイル内の #見出し だけなら、画像を開く。
const outerHref = (href, image) => (href.startsWith("#") ? image.href : href);

// 段落の中の画像は、行き先（imageTarget）と、名前の組（代替テキストのコードとコメントの外を escape で変えたもの。
// 代替テキストが無ければファイル名）で表す。

// Markdown の画像（IMAGE_SRC の一致 m が s の at から）。参照形式で定義が無ければ null。
function markdownImage(s, m, at, definitions, escape) {
  const [whole, alt, dest, label] = m;
  const altEnd = at + 2 + alt.length;
  let value;
  if (dest !== undefined) {
    const from = spaceEnd(s.mask, altEnd + 2);
    value = s.text.slice(from, from + dest.length);
  } else {
    const end = at + whole.length - 1;
    value = definitions.get(normalizeLabel(label ? s.text.slice(end - label.length, end) : s.text.slice(at + 2, altEnd)));
  }
  const target = value === undefined ? null : imageTarget(unwrap(value), value.startsWith("<"));
  if (!target) return null;
  return { ...target, name: alt ? render(s, at + 2, altEnd, escape) : plain(escape(target.file)) };
}

// <img>（属性の並び attrs が s の at から）。src が無いか data: か、src にインラインコードかコメントがあれば null（行き先にしない）。
function inlineTagImage(s, at, attrs, escape) {
  const src = attrAt(s, at, attrs, "src");
  if (!src || hasKeep(s, src.start, src.end)) return null;
  const target = imageTarget(decodeEntities(s.text.slice(src.start, src.end)));
  if (!target) return null;
  const alt = attrAt(s, at, attrs, "alt");
  const name = alt && alt.end > alt.start ? render(s, alt.start, alt.end, (t) => escape(decodeEntities(t))) : plain(escape(target.file));
  return { ...target, name };
}

// Markdown のリンクの組。
const linkTo = (name, href) => join([plain("["), name, plain(`](${markdownDest(href)})`)]);

// リンクの中身の組の画像を、名前の文字にする（中の画像を別のリンクにしない）。first: 最初の画像（無ければ null）。
// brackets: 画像の外の [ ] を文字のままにするか。
function namesOnly(s, definitions, brackets = false) {
  let first = null;
  const named = replaceIn(s, IMAGE_OR_BRACKET, (m, at) => {
    const [whole, alt, , , imgAttrs, escaped] = m;
    if (escaped !== undefined) return null;
    if (alt === undefined && imgAttrs === undefined) return brackets ? plain(`\\${whole}`) : null;
    const image = imgAttrs === undefined ? markdownImage(s, m, at, definitions, escapeMarkdown) : inlineTagImage(s, at + 4, imgAttrs, escapeMarkdown);
    if (!image) return null;
    first ??= image;
    return image.name;
  });
  return { text: trimmed(named), first };
}

// 段落の中の書き換え（Markdown のリンクにする。s は組）。画像を包むリンク（ほかの文字と並んでいてもよい）は、画像を名前の文字にして、
// 外側のリンク先を開く 1 つのリンクにする。外側が同じファイル内の #見出し だけなら、最初の画像を開く。
function rewriteInline(s, definitions) {
  const anchors = replaceIn(s, ANCHOR, (m, at) => {
    const [, aAttrs, inner] = m;
    const href = attrAt(s, at + 2, aAttrs, "href");
    if (!href || hasKeep(s, href.start, href.end)) return null;
    const innerAt = at + 2 + aAttrs.length + 1;
    const named = namesOnly(sliceOf(s, innerAt, innerAt + inner.length), definitions, true);
    return named.first && linkTo(named.text, outerHref(decodeEntities(s.text.slice(href.start, href.end)), named.first));
  });
  const links = replaceIn(anchors, LINK, (m, at) => {
    const [whole, inner, outerDest, outerLabel] = m;
    const innerEnd = at + 1 + inner.length;
    const named = namesOnly(sliceOf(anchors, at + 1, innerEnd), definitions);
    let outer;
    if (outerDest !== undefined) {
      const from = spaceEnd(anchors.mask, innerEnd + 2);
      outer = anchors.text.slice(from, from + outerDest.length);
    } else {
      // 定義の無い参照形式は、外側がリンクではないので、中の画像だけを書き換える（下の置き換えで）。
      const end = at + whole.length - 1;
      outer = definitions.get(normalizeLabel(anchors.text.slice(end - outerLabel.length, end)));
    }
    return named.first && outer !== undefined ? linkTo(named.text, outerHref(unwrap(outer), named.first)) : null;
  });
  const images = replaceIn(links, IMAGE, (m, at) => {
    const image = markdownImage(links, m, at, definitions, escapeMarkdown);
    return image && linkTo(image.name, image.href);
  });
  return replaceIn(images, IMG_TAG, (m, at) => {
    const image = inlineTagImage(images, at + 4, m[1], escapeMarkdown);
    return image && linkTo(image.name, image.href);
  });
}

// <picture> の中の <img>（s は組）。部品は <picture> の中の <a> を押せるリンクにしない（実機で確認）ので、
// 画像があったことと場所を押せない文字で出す。
function rewritePictureImages(s) {
  return replaceIn(s, IMG_TAG, (m, at) => {
    const image = inlineTagImage(s, at + 4, m[1], escapeHtml);
    return image && join([plain("画像: "), image.name, plain(escapeHtml(`（${image.src}）`))]);
  });
}

// HTML のかたまりの中の書き換え（押せる <a> にする。Markdown の書き方はここでは効かないので触らない）。
// parts は segments の結果。開いている <a href> の中の <img> は名前だけにして、外側の <a> を押せるリンクに残す
// （外側の行き先が同じファイル内の #見出し だけなら、その <a> の行き先を最初の画像にする）。<picture> の中は押せない文字。
// loneImg: かたまりが 1 つの <img> だけの行で始まるか。その <img> を <a href>名前</a> の 1 行にすると、タグだけの行でなくなり
// 部品が段落として読む（段落の中の <a> は押せない）ので、開きタグのあとで改行して、最初の行をタグだけの行のままにする。
const HTML_TOKEN = new RegExp(String.raw`<a\b(${ATTRS})>|<\/a\s*>|<(\/?)picture\b${ATTRS}>|<img\b(${ATTRS})>`, "gi");
function rewriteHtmlBlock(parts, state, loneImg) {
  const out = [];
  let anchor = null; // { href, at: out の中の開きタグの位置 }
  let lone = loneImg; // 次のタグが、最初の行の 1 つだけの <img> か
  for (const part of parts) {
    if (part.keep) { out.push(part.text); continue; }
    let i = 0;
    for (const m of matchesOf(part.text, HTML_TOKEN)) {
      out.push(part.text.slice(i, m.index));
      i = m.index + m[0].length;
      const [tag, aAttrs, pictureClose, imgAttrs] = m;
      const breakAfterOpen = lone;
      lone = false;
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
      else if (state.picture) out.push(rewritePictureImages(plain(tag)).text);
      else if (!anchor) out.push(`<a href="${escapeHtml(image.href)}">${breakAfterOpen ? "\n" : ""}${escapeHtml(image.name)}</a>`);
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

const PICTURE_OPEN = new RegExp(String.raw`<picture\b${ATTRS}>`, "gi");
const PICTURE_CLOSE = /<\/picture\s*>/gi;
// <picture> の外は rewrite で、中は押せない文字で書き換える（s は組）。state.picture は行をまたぐ <picture> の中か。
function aroundPictures(s, state, rewrite) {
  const pieces = [];
  for (let at = 0; at < s.mask.length;) {
    const mark = state.picture ? PICTURE_CLOSE : PICTURE_OPEN;
    mark.lastIndex = at;
    const m = mark.exec(s.mask);
    const cut = m ? m.index + m[0].length : s.mask.length;
    const chunk = at === 0 && cut === s.mask.length ? s : sliceOf(s, at, cut);
    pieces.push(state.picture ? rewritePictureImages(chunk) : rewrite(chunk));
    if (m) state.picture = !state.picture;
    at = cut;
  }
  return join(pieces);
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
// 1 つの <img> だけの行（HTML_LONE_TAG のうち <img> のもの）。
const LONE_IMG = new RegExp(String.raw`^ {0,3}(?=<img\b)${HTML_OPEN_TAG}\s*$`, "i");

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
// state.picture は <picture> の中か。HTML のかたまりの間でだけ続ける（段落の中の <picture> は段落で終わる）。
function mapBlocks(markdown, visit) {
  const state = { picture: false };
  return blocksOf(markdown).map(({ kind, lines }) => {
    const text = lines.join("\n");
    if (kind !== "html" && kind !== "text") return text;
    const out = visit(text, kind, state);
    if (kind === "text") state.picture = false;
    return out;
  }).join("\n");
}

// かたまりの文字列を、書き換えてよい部分と、インラインコード・HTML のコメントの部分（keep）に分ける。
// 閉じない <!-- はそのかたまりの終わりまで（コメントのかたまりは --> の行まで続き、ほかのかたまりの中のものは
// CommonMark ではそのかたまりの中だけのもの）。
function segments(text) {
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
    mark.lastIndex = i;
    const hit = mark.exec(text);
    if (!hit) { push(text.slice(i)); break; }
    if (hit.index > i) push(text.slice(i, hit.index));
    if (hit[0] === "<!--") {
      const end = text.indexOf("-->", hit.index + 4);
      if (end < 0) { push(text.slice(hit.index), true); return out; }
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

// 参照形式の定義（[id]: path）を、文書全体（コードブロック・HTML のかたまりの外）から集める。CommonMark と同じく、
// 定義は段落の始まりにだけ並べられ（段落の続きの行は定義にならない）、インラインコードやコメントより先に読む。
// ラベルは大文字小文字と空白の違いを無視する。同じラベルは最初の定義。値は書いたままの参照先（<...> を含む）。
export function collectDefinitions(markdown) {
  const definitions = new Map();
  mapBlocks(markdown, (text, kind) => {
    if (kind !== "text") return text;
    DEFINITION.lastIndex = 0;
    for (let m; DEFINITION.lastIndex < text.length && (m = DEFINITION.exec(text)) && m[1].trim();) {
      if (!definitions.has(normalizeLabel(m[1]))) definitions.set(normalizeLabel(m[1]), m[2]);
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
    const parts = segments(text);
    if (kind === "html") return rewriteHtmlBlock(parts, state, LONE_IMG.test(text.split("\n", 1)[0]));
    return aroundPictures(pairOf(parts), state, (s) => rewriteInline(s, definitions)).text;
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
