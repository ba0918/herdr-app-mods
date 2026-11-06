// Markdown の整形表示に渡す前の書き換えと、リンクを押したときの行き先。
import { basename, dirname, resolvePath } from "./path.js";

// 整形表示の部品はローカル画像を出せないので、押せるリンクに差し替える。その印のスキーム。
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

const IMAGE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

function encodePath(path) {
  return encodeURI(path).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function rewriteText(text) {
  return text.replace(IMAGE, (whole, alt, url) => {
    const path = url.startsWith("<") ? url.slice(1, -1) : url;
    if (/^(https?:|data:)/i.test(path)) return whole;
    return `[${alt || basename(path)}](${IMAGE_SCHEME}${encodePath(path)})`;
  });
}

const FENCE = /^ {0,3}(```|~~~)/;

export function rewriteLocalImages(markdown) {
  let fence = null;
  return markdown.split("\n").map((line) => {
    const open = line.match(FENCE);
    if (fence) {
      if (open && open[1] === fence) fence = null;
      return line;
    }
    if (open) { fence = open[1]; return line; }
    // インラインコード（`...`）の中は書き換えない。
    return line.split(/(`+[^`]*`+)/).map((part, i) => (i % 2 ? part : rewriteText(part))).join("");
  }).join("\n");
}
