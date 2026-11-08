// Markdown の大きさで、整形の準備を描画の中でするか、整形表示をするかを決める（仕様の「整形の準備」「整形表示の上限」）。
// 中身が変わるたびに（ソース表示の打鍵でも）呼ぶので、1 MiB の文書でも軽く済むように、要らない数え方は省く。
// 値は実機で測ったもの（ガイドの「制約」の「描画の中の整形の準備の大きさ」「整形表示の部品の重さ」）。
import { fenceOpen, closesFence } from "./markdown.js";

// これ以下なら描画の中で整形の準備をする。chars: 文字数（JavaScript の文字列の長さ）、diagrams: ```mermaid の図の数。
export const PREPARE_IN_RENDER = { chars: 14109, diagrams: 2 };
// これを超えたら整形表示をしない。bytes: UTF-8 にした大きさ、diagrams: ```mermaid の図の数。
export const RENDER_LIMIT = { bytes: 229153, diagrams: 500 };

// UTF-8 にした大きさ（TextEncoder が無いので）。対になっていないサロゲートは、置き換え文字（3 バイト）として数える。
export function utf8Length(text) {
  try {
    // 組み込みの関数に任せると、1 文字ずつ数えるより速い（ガイドの「制約」）。対になっていないサロゲートでは URIError になる。
    return unescape(encodeURIComponent(text)).length;
  } catch {
    let n = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
}

// フェンスになりうる行（行頭の空白 3 つまでのあとに ``` か ~~~）。
const FENCE_LINE = /^ {0,3}(?:`{3,}|~{3,})/gm;

// ```mermaid の図の数（splitMermaidBlocks の図の部分の数と同じ）。フェンスになりうる行だけを見る。
export function countDiagrams(text) {
  let count = 0, open = null;
  FENCE_LINE.lastIndex = 0;
  for (let m; (m = FENCE_LINE.exec(text));) {
    // 行は "\n" で分ける（splitMermaidBlocks と同じ）。"\r" などのあとの位置は行頭ではない。
    if (m.index > 0 && text[m.index - 1] !== "\n") continue;
    const end = text.indexOf("\n", m.index);
    const line = text.slice(m.index, end < 0 ? text.length : end);
    if (!open) { open = fenceOpen(line); continue; }
    if (!closesFence(line, open)) continue;
    if (open.info.toLowerCase() === "mermaid") count++;
    open = null;
  }
  return count;
}

// 今の内容 text の判定。inRender: 整形の準備を描画の中でするか。over: 整形表示の上限を超えていれば
// { kind: "bytes" | "diagrams", limit, size }（両方超えていればバイト数）、超えていなければ null。
export function judgeSize(text) {
  const over = (kind, size) => ({ inRender: false, over: { kind, limit: RENDER_LIMIT[kind], size } });
  // 1 文字は 1 バイト以上なので、文字数が上限を超えていればバイト数も超えている（図は数えない）。
  if (text.length > RENDER_LIMIT.bytes) return over("bytes", utf8Length(text));
  // 1 文字（UTF-16 の 1 つ）は 3 バイトまでなので、文字数の 3 倍が上限以下ならバイト数は数えない。
  if (text.length * 3 > RENDER_LIMIT.bytes) {
    const bytes = utf8Length(text);
    if (bytes > RENDER_LIMIT.bytes) return over("bytes", bytes);
  }
  const diagrams = countDiagrams(text);
  if (diagrams > RENDER_LIMIT.diagrams) return over("diagrams", diagrams);
  return { inRender: text.length <= PREPARE_IN_RENDER.chars && diagrams <= PREPARE_IN_RENDER.diagrams, over: null };
}
