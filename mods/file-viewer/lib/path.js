// パスの文字列処理（/ と \ の両方を区切りとして扱う）。
export function basename(path) {
  return path.split(/[\\/]/).pop() ?? "";
}

export function parentName(path) {
  const parts = path.split(/[\\/]/);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

const isWindows = (path) => /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");

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
  const out = [];
  for (const [i, part] of parts.entries()) {
    if (part === "." || (part === "" && i > 0 && i < parts.length - 1)) continue;
    if (part === "..") { if (out.length > 1) out.pop(); continue; }
    out.push(part);
  }
  return out.join(sep);
}
