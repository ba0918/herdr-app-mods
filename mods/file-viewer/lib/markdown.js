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

// すでにエンコードされた部分（%20 など）は一度戻してからエンコードする（二重にしない）。
function encodePath(path) {
  return encodeURI(decode(path)).replace(/\(/g, "%28").replace(/\)/g, "%29");
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
