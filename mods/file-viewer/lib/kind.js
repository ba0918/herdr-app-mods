// どの viewer で開くか（開けないならその理由）を、パス・大きさ・内容から決める。
import { basename } from "./path.js";
import { limitMessage } from "./size.js";

export const TEXT_LIMIT = 1024 * 1024;
export const IMAGE_LIMIT = 6_000_000;

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);
const BY_EXTENSION = { md: "markdown", markdown: "markdown", mmd: "mermaid", mermaid: "mermaid" };

export function extension(path) {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function kind({ path, size, text }) {
  const ext = extension(path);
  if (IMAGE.has(ext)) {
    if (size > IMAGE_LIMIT) return { type: "unopenable", reason: "too-large", limit: IMAGE_LIMIT };
    return { type: "image", source: ext === "svg" && size <= TEXT_LIMIT };
  }
  if (size > TEXT_LIMIT) return { type: "unopenable", reason: "too-large", limit: TEXT_LIMIT };
  if (text === undefined) return { type: "needs-text" };
  if (text.includes("\0")) return { type: "unopenable", reason: "binary" };
  return { type: BY_EXTENSION[ext] ?? "code", source: true };
}

// 開けないファイルの、内容の代わりに出す理由（size: ファイルの大きさ）。
export function unopenableReason(view, size) {
  if (view.reason === "binary") return "バイナリのため表示できない";
  if (view.reason === "too-large") return limitMessage({ limit: view.limit, size });
  if (view.reason === "missing") return "ファイルが無くなった";
  return `読み込めなかった: ${view.message ?? ""}`;
}

// Editor（code viewer）に渡す言語名。読み替えは同梱 Files と同じ。
const LANGUAGE = {
  ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js",
  toml: "yaml", jsonc: "json", svelte: "html", vue: "html",
  md: "markdown", markdown: "markdown", svg: "xml", mmd: "txt", mermaid: "txt",
};

export function languageFor(path) {
  const ext = extension(path);
  return LANGUAGE[ext] ?? (ext || "txt");
}
