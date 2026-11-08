// Mermaid 単体ファイル（.mmd / .mermaid）の図の見え方（仕様の「Mermaid 単体ファイル」）。
// Markdown の整形表示と同じ決まり（lib/markdown-state.js）で、ファイル全体を図 1 つの文書として扱う。大きさで描画の中と外を
// 分けず、いつも描画の外で準備する。図の準備の時間切れと最初の書き出しの失敗は、描けない図の理由にする（仕様の「描けない図」）。
import { MarkdownState } from "./markdown-state.js";
import { layoutMermaid } from "./prepare.js";

// text の図の準備。1 単位（図 1 個の解析と配置）で終わる。parts は図の部分 1 つ。
export function startDiagramPreparation(text) {
  const prep = {
    parts: [], done: false, failed: false,
    advance() {
      if (!prep.done) {
        prep.parts.push({ type: "mermaid", source: text, firstLine: 1, fence: "```\n" + text + "\n```", ...layoutMermaid(text, 1) });
        prep.done = true;
      }
      return true;
    },
  };
  return prep;
}

const OUTSIDE = () => ({ inRender: false, over: null });

// fileOf: 図の部分を見た目で書き出すファイル（lib/diagram-files.js の diagramFile）。
export function diagramFileState({ fileOf, timeLimit } = {}) {
  return new MarkdownState({ start: startDiagramPreparation, judge: OUTSIDE, fileOf, ...(timeLimit ? { timeLimit } : {}) });
}

function reason(failure) {
  if (failure?.kind === "timeout") return "図の準備が終わらなかった";
  if (failure?.kind === "write") return `図を書き出せなかった（${failure.message}）`;
  return failure?.message ?? "図を表示できない";
}

// MarkdownState の display() を、.mmd の出し方にする。{ kind: "preparing" | "diagram" | "error", part?, message?, fence?, notices }。
// fence は描けない図のコード（理由を出した結果の中身。読み直しの準備の間に、今の中身と組み合わせない）。
// notices は知らせるだけのもの（書き直しの失敗）。
export function diagramFileView(display) {
  if (display.kind === "preparing" || display.kind === "loading") return { kind: "preparing", notices: display.notices };
  if (display.kind === "fallback") return { kind: "error", message: reason(display.notices[0]), fence: "```\n" + display.parts[0].text + "\n```", notices: [] };
  const part = display.parts[0];
  if (part.error) return { kind: "error", message: part.error.message, fence: part.fence, notices: display.notices };
  return { kind: "diagram", part, notices: display.notices };
}
