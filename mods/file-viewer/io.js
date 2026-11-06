// space の machine 上のファイルの読み書き。
// 他 machine（WSL・ssh）は exec で sh を動かし、基準（内容の sha256）は machine 側の sha256sum で取る。
// このコンピュータ（machine が null）は readTextFile / writeTextFile と、文字列のハッシュを使う。
import { exec, readTextFile, writeTextFile, appHome } from "herdr";
import { createHash } from "crypto";
import * as fs from "fs/promises";
import { TEXT_LIMIT, IMAGE_LIMIT, extension } from "./lib/kind.js";
import { splitForWrite } from "./lib/save.js";
import { base64ToBytes } from "./lib/image.js";

export const CACHE_DIR = "file-viewer-cache";
export const DRAFTS_DIR = "file-viewer-drafts";
const HEADER_BYTES = 256 * 1024;

const STAT = `stat -L -c '%s|%y' -- "$1"`;

// 保存を止めた理由。stale: ディスクが基準から変わった、missing / exists: ファイルの有無が想定と違う。
export class WriteConflict extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

async function sh(on, script, args) {
  return exec("sh", ["-c", script, "file-viewer", ...args], { on });
}

const textHash = (text) => createHash("sha256").update(text).digest("hex");

function splitHead(stdout, lines) {
  const out = [];
  let rest = stdout;
  for (let i = 0; i < lines; i++) {
    const cut = rest.indexOf("\n");
    out.push(cut < 0 ? rest : rest.slice(0, cut));
    rest = cut < 0 ? "" : rest.slice(cut + 1);
  }
  return [out, rest];
}

const sizeOf = (stat) => Number(stat.split("|")[0]);

async function localSize(path) {
  const r = await exec("powershell", ["-NoProfile", "-Command", `(Get-Item -LiteralPath ${psQuote(path)}).Length`]);
  if (r.code !== 0) return null;
  return Number(r.stdout.trim());
}

function psQuote(text) {
  return `'${String(text).replace(/['‘’‚‛]/g, "$&$&")}'`;
}

// テキストのファイルを読む。{ exists, size, base: { hash, stat, text? }, text }。
// 上限を超えるときは text を読まずに返す（size だけ）。
export async function readText(path, on) {
  if (!on) {
    const size = await localSize(path);
    if (size === null) return { exists: false };
    if (size > TEXT_LIMIT) return { exists: true, size };
    const text = await readTextFile(path);
    if (text === null) return { exists: false };
    return { exists: true, size, text, base: { hash: textHash(text), stat: null, text } };
  }
  const script = `[ -e "$1" ] || exit 4; s=$(${STAT}) || exit 5; printf '%s\\n' "$s"; [ "\${s%%|*}" -le "$2" ] || exit 0; sha256sum -- "$1" | cut -d' ' -f1; cat -- "$1"`;
  const r = await sh(on, script, [path, String(TEXT_LIMIT)]);
  if (r.code === 4) return { exists: false };
  if (r.code !== 0) throw new Error(r.stderr.trim() || `読み込みに失敗した（${r.code}）`);
  const [[stat, hash], text] = splitHead(r.stdout, 2);
  const size = sizeOf(stat);
  if (size > TEXT_LIMIT) return { exists: true, size };
  return { exists: true, size, text, base: { hash, stat } };
}

// ディスクが基準（base）から変わったか。{ missing } か { changed, base }（changed なら新しい基準）。
export async function checkChanged(path, on, base) {
  if (!on) {
    const text = await readTextFile(path).catch(() => null);
    if (text === null) return { missing: true };
    const hash = textHash(text);
    return { missing: false, changed: hash !== base?.hash, base: { hash, stat: null, text } };
  }
  const r = await sh(on, `${STAT} 2>/dev/null || echo missing`, [path]);
  const stat = r.stdout.trim();
  if (stat === "missing") return { missing: true };
  if (base && stat === base.stat) return { missing: false, changed: false, base };
  const h = await sh(on, `sha256sum -- "$1" | cut -d' ' -f1`, [path]);
  if (h.code !== 0) return { missing: true };
  const hash = h.stdout.trim();
  return { missing: false, changed: hash !== base?.hash, base: { hash, stat } };
}

// 基準と同じなら書く。base が null なら、ファイルが無いときだけ作る。
// 他 machine は同じフォルダの一時ファイルに小分けに追記し、直前にハッシュを比べてから mv で置き換える。
// 戻り値は新しい基準。食い違いは WriteConflict、書けないときは Error（理由つき）。
export async function writeText(path, on, text, base) {
  if (!on) {
    try { await writeTextFile(path, text, base ? base.text : null); }
    catch (e) { throw /stale|match|exist/i.test(String(e)) ? new WriteConflict(base ? "stale" : "exists") : e; }
    return { hash: textHash(text), stat: null, text };
  }
  const prep = await sh(on, `real=$(readlink -f -- "$1" 2>/dev/null || printf %s "$1"); [ -e "$real" ] && [ ! -w "$real" ] && { echo "書き込み権限が無い" >&2; exit 2; }; d=$(dirname -- "$real"); [ -w "$d" ] || { echo "フォルダに書き込めない: $d" >&2; exit 2; }; t="$d/.$(basename -- "$real").file-viewer-$$"; : > "$t" || exit 1; printf '%s\\n%s\\n' "$real" "$t"`, [path]);
  if (prep.code !== 0) throw new Error(prep.stderr.trim() || "保存の準備に失敗した");
  const [[real, temp]] = splitHead(prep.stdout, 2);
  try {
    for (const part of splitForWrite(text)) {
      const r = await sh(on, `printf '%s' "$2" >> "$1"`, [temp, part]);
      if (r.code !== 0) throw new Error(r.stderr.trim() || "書き込みに失敗した");
    }
  } catch (e) {
    await sh(on, `rm -f -- "$1"`, [temp]).catch(() => {});
    throw e;
  }
  const finish = `real=$1; t=$2; want=$3
if [ -n "$want" ]; then
  [ -e "$real" ] || { rm -f -- "$t"; echo missing; exit 3; }
  [ "$(sha256sum -- "$real" | cut -d' ' -f1)" = "$want" ] || { rm -f -- "$t"; echo stale; exit 3; }
  chmod --reference="$real" -- "$t" 2>/dev/null
else
  [ -e "$real" ] && { rm -f -- "$t"; echo exists; exit 3; }
fi
h=$(sha256sum -- "$t" | cut -d' ' -f1)
mv -f -- "$t" "$real" || { rm -f -- "$t"; exit 1; }
printf '%s\\n' "$h"; ${STAT.replace('"$1"', '"$real"')}`;
  const r = await sh(on, finish, [real, temp, base?.hash ?? ""]);
  if (r.code === 3) throw new WriteConflict(r.stdout.trim());
  if (r.code !== 0) throw new Error(r.stderr.trim() || "置き換えに失敗した");
  const [[hash, stat]] = splitHead(r.stdout, 2);
  return { hash, stat };
}

function cachePath(name) {
  return `${appHome()}/${CACHE_DIR}/${name}`;
}

// 画像を app home の file-viewer-cache/ にコピーする（image() は app home の相対パスしか出せない）。
// { exists, size, base, cache: "file-viewer-cache/<name>", header: Uint8Array }。上限超えは cache なし。
export async function copyImage(path, on, prefix) {
  await fs.mkdir(`${appHome()}/${CACHE_DIR}`, { recursive: true }).catch(() => {});
  const ext = extension(path);
  if (!on) {
    const r = await exec("powershell", ["-NoProfile", "-Command",
      `$ErrorActionPreference='Stop'; $p=${psQuote(path)}; if (-not (Test-Path -LiteralPath $p)) { exit 4 }; $b=[IO.File]::ReadAllBytes($p); $h=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower(); "$($b.Length)"; $h; if ($b.Length -le ${IMAGE_LIMIT}) { $n=${psQuote(`${prefix}-`)}+$h.Substring(0,12)+${psQuote(`.${ext}`)}; [IO.File]::WriteAllBytes((Join-Path ${psQuote(`${appHome()}/${CACHE_DIR}`)} $n), $b); $n; [Convert]::ToBase64String($b, 0, [Math]::Min($b.Length, ${HEADER_BYTES})) }`]);
    if (r.code === 4) return { exists: false };
    if (r.code !== 0) throw new Error(r.stderr.trim() || "画像を読めなかった");
    const [[size, hash, name, header]] = splitHead(r.stdout.replace(/\r/g, ""), 4);
    if (Number(size) > IMAGE_LIMIT) return { exists: true, size: Number(size) };
    return { exists: true, size: Number(size), base: { hash, stat: null }, cache: `${CACHE_DIR}/${name}`, header: base64ToBytes(header) };
  }
  const script = `[ -e "$1" ] || exit 4; s=$(${STAT}) || exit 5; printf '%s\\n' "$s"; [ "\${s%%|*}" -le "$2" ] || exit 0; sha256sum -- "$1" | cut -d' ' -f1; base64 -w0 -- "$1"`;
  const r = await sh(on, script, [path, String(IMAGE_LIMIT)]);
  if (r.code === 4) return { exists: false };
  if (r.code !== 0) throw new Error(r.stderr.trim() || "画像を読めなかった");
  const [[stat, hash], data] = splitHead(r.stdout, 2);
  const size = sizeOf(stat);
  if (size > IMAGE_LIMIT) return { exists: true, size };
  const name = `${prefix}-${hash.slice(0, 12)}.${ext}`;
  // mod からはバイナリを書けない（Uint8Array は 0 バイトになる）ので、base64 の文字列を書いて PowerShell で戻す。
  const b64 = cachePath(`${name}.b64`);
  await fs.writeFile(b64, data);
  const d = await exec("powershell", ["-NoProfile", "-Command",
    `$ErrorActionPreference='Stop'; [IO.File]::WriteAllBytes(${psQuote(cachePath(name))}, [Convert]::FromBase64String([IO.File]::ReadAllText(${psQuote(b64)}))); Remove-Item -LiteralPath ${psQuote(b64)}`]);
  if (d.code !== 0) throw new Error(d.stderr.trim() || "画像のコピーに失敗した");
  return { exists: true, size, base: { hash, stat }, cache: `${CACHE_DIR}/${name}`, header: base64ToBytes(data, HEADER_BYTES) };
}

export async function removeCache(cache) {
  if (!cache) return;
  await fs.unlink(`${appHome()}/${cache}`).catch(() => {});
}

export async function listCache() {
  return fs.readdir(`${appHome()}/${CACHE_DIR}`).catch(() => []);
}

// ---- 下書き（app home の file-viewer-drafts/ に 1 つずつ JSON で置く） ----

const draftsDir = () => `${appHome()}/${DRAFTS_DIR}`;

export function draftName(token, machine, path) {
  return `${token}-${textHash(`${machine ?? ""}\n${path}`).slice(0, 16)}.json`;
}

// すべての下書き。読めないファイルは飛ばす。各下書きに name（ファイル名）を付けて返す。
export async function listDrafts() {
  const names = await fs.readdir(draftsDir()).catch(() => []);
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try { out.push({ ...JSON.parse(await fs.readFile(`${draftsDir()}/${name}`, "utf8")), name }); }
    catch { /* 書きかけや壊れたものは無視する */ }
  }
  return out;
}

export async function writeDraft(draft) {
  await fs.mkdir(draftsDir(), { recursive: true }).catch(() => {});
  const { name, ...body } = draft;
  await fs.writeFile(`${draftsDir()}/${name ?? draftName(draft.token, draft.machine, draft.path)}`, JSON.stringify(body));
}

export async function deleteDraft(name) {
  await fs.unlink(`${draftsDir()}/${name}`).catch(() => {});
}
