// パスの文字列処理（/ と \ の両方を区切りとして扱う）。
export function basename(path) {
  return path.split(/[\\/]/).pop() ?? "";
}

export function parentName(path) {
  const parts = path.split(/[\\/]/);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

const isWindows = (path) => /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");

// 同じファイルを同じ文字列にする。Windows のパスは区切りを \ にそろえる
// （ツリーは space のフォルダに / でつなぎ、リンクの解決は \ でつなぐため）。
// 続いた区切りは 1 つに畳む（C:\ や / が space のフォルダだと、ツリーのパスに区切りが 2 つ続くため）。
// \\server\share の先頭の 2 つは畳まない。
export function normalizePath(path) {
  const sep = isWindows(path) ? "\\" : "/";
  const unified = sep === "\\" ? path.replace(/\//g, "\\") : path;
  const head = unified.startsWith("\\\\") ? 2 : 0;
  return unified.slice(0, head) + unified.slice(head).replace(sep === "\\" ? /\\{2,}/g : /\/{2,}/g, sep);
}

export function isAbsolute(path) {
  return path.startsWith("/") || isWindows(path);
}

export function dirname(path) {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut <= 0 ? path.slice(0, cut + 1) : path.slice(0, cut);
}

// base（フォルダ）を基準に rel を解決し、. と .. を畳む。区切りは base の流儀に揃える。
export function resolvePath(base, rel) {
  const sep = isWindows(base) ? "\\" : "/";
  const joined = isAbsolute(rel) ? rel : `${base}${sep}${rel}`;
  const parts = joined.split(/[\\/]/);
  // \\server\share の先頭の 2 つの区切りは畳まない。
  const head = joined.startsWith("\\\\") ? 2 : 1;
  const out = [];
  for (const [i, part] of parts.entries()) {
    if (part === "." || (part === "" && i >= head && i < parts.length - 1)) continue;
    if (part === "..") { if (out.length > head) out.pop(); continue; }
    out.push(part);
  }
  return out.join(sep);
}
