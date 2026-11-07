// 整形の準備（画像を押せる名前にし、Mermaid の図を解析・配置する）を、少しずつ進められる単位の並びにする。
// 大きな文書では描画の外で、時間の予算で区切りながら進める（仕様の「整形の準備」）。描画の中で済ませる文書も、
// 同じものを予算無しで最後まで進めて使うので、区切った結果と一度に進めた結果は同じになる。
// 単位: かたまり 1 つ分の定義の収集、文章の部分のかたまり 1 つ分の画像の書き換え、図 1 個の解析と配置。
import { blocksIn, addDefinitions, blockRewriter, splitMermaidBlocks } from "./markdown.js";
import { parseMermaid } from "./mermaid/parse.js";
import { layoutFlowchart, layoutSequence } from "./mermaid/layout.js";

// 図の解析と配置。{ layout } か { error }。firstLine は図の中身の 1 行目のファイル全体での行番号。
export function layoutMermaid(source, firstLine) {
  try {
    const r = parseMermaid(source, firstLine);
    if (r.error) return { error: r.error };
    return { layout: r.diagram.type === "flowchart" ? layoutFlowchart(r.diagram) : layoutSequence(r.diagram) };
  } catch {
    // 解析で断れなかった配置できない図。どの行かは分からないので、図の 1 行目を指す。
    return { error: { kind: "syntax", message: `${firstLine} 行目の文法エラー` } };
  }
}

// text の準備を始める。advance(budget, now) で、now() の差が budget（ms）に届くまで単位を進め（1 回に少なくとも 1 単位）、
// 終わったら true。終わると parts に、文章の部分（{ type: "markdown", text: 書き換えた Markdown }）と
// 図の部分（{ type: "mermaid", source, firstLine, fence, layout | error }）の並びが入る。
// 画像の書き換えが例外を投げたら、advance からそのまま投げ、failed にして以後は進めない。
// rewriter: かたまりの書き換えを作るもの（既定は blockRewriter）。
export function startPreparation(text, { rewriter = blockRewriter } = {}) {
  const definitions = new Map();
  const parts = [];
  let blocks = blocksIn(text);
  let split = null;   // 図の境目で分けた部分（定義を集め終えたら作る）
  let index = 0;      // split の中の、次に進める部分
  let current = null; // 書き換えている文章の部分 { blocks, rewrite, out }

  // 1 単位進める。終わったら true。
  function step() {
    if (!split) {
      const next = blocks.next();
      if (!next.done) { addDefinitions(next.value, definitions); return false; }
      split = splitMermaidBlocks(text);
      blocks = null;
      return split.length === 0;
    }
    const part = split[index];
    if (part.type === "mermaid") {
      parts.push({ ...part, ...layoutMermaid(part.source, part.firstLine) });
      index++;
      return index >= split.length;
    }
    current ??= { blocks: blocksIn(part.text), rewrite: rewriter(definitions), out: [] };
    const next = current.blocks.next();
    if (!next.done) {
      current.out.push(current.rewrite(next.value.lines.join("\n"), next.value.kind));
      return false;
    }
    parts.push({ type: "markdown", text: current.out.join("\n") });
    current = null;
    index++;
    return index >= split.length;
  }

  const prep = {
    parts, done: false, failed: false,
    advance(budget, now) {
      if (prep.done || prep.failed) return prep.done;
      const start = now();
      try {
        do {
          if (step()) { prep.done = true; break; }
        } while (now() - start < budget);
      } catch (e) {
        prep.failed = true;
        throw e;
      }
      return prep.done;
    },
  };
  return prep;
}

// text の準備を、予算無しで最後まで進めたもの。
export function prepareAll(text) {
  const prep = startPreparation(text);
  prep.advance(Infinity, () => 0);
  return prep;
}

// 整形の準備に失敗したときの代わりの整形表示の部分。整形の準備を何もせず、今の内容をそのまま 1 つの文章の部分にする
// （画像は押せる名前にせず、```mermaid も図にせずコードのまま出る。図の配置が重さの原因でも止まらないように）。
export function fallbackParts(text) {
  return [{ type: "markdown", text }];
}
