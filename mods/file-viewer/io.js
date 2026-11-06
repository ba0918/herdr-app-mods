// space の machine 上のファイルの読み書き。
// 他 machine（WSL・ssh）は exec で sh を動かし、基準（内容の sha256）は machine 側の sha256sum で取る。
// このコンピュータ（machine が null）は readTextFile / writeTextFile と、文字列のハッシュを使う。
import { exec, readTextFile, writeTextFile, appHome } from "herdr";
import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import { TEXT_LIMIT, IMAGE_LIMIT, extension } from "./lib/kind.js";
import { splitForWrite } from "./lib/save.js";
import { base64ToBytes } from "./lib/image.js";
import { createDraftStore } from "./lib/draft-store.js";
import { utf8Checker } from "./lib/utf8.js";

export const CACHE_DIR = "file-viewer-cache";
export const DRAFTS_DIR = "file-viewer-drafts";
const HEADER_BYTES = 256 * 1024;

const STAT = `stat -L -c '%s|%y' -- "$1"`;
// 保存の各スクリプトの先頭。$1 のパス（リンクなら指す先）を real、そのフォルダを d、
// 同じフォルダの一時ファイル（接尾辞 $2）を t にする。$(...) は末尾の改行を落とすので x を足して戻す。
const LOCATE = `real=$( { readlink -f -- "$1" 2>/dev/null || printf '%s\\n' "$1"; }; printf x); real=\${real%?x}; case $real in */*) d=\${real%/*}; d=\${d:-/} ;; *) d=. ;; esac; t="$d/.\${real##*/}.file-viewer-$2"`;

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

// 読めなかったときの理由。大きさが分かっていれば添える（開けないファイルの案内に出すため）。
function readFailure(text, size) {
  const e = new Error(text);
  if (Number.isFinite(size)) e.size = size;
  return e;
}

// 読み込みのスクリプトが途中で失敗したとき、先に出した stat の行から大きさを取る。無ければ undefined。
const sizeBefore = (stdout) => { const m = /^(\d+)\|/.exec(stdout); return m ? Number(m[1]) : undefined; };

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
    const text = await readTextFile(path).catch((e) => { throw readFailure(String(e?.message ?? e), size); });
    if (text === null) return { exists: false };
    return { exists: true, size, text, base: { hash: textHash(text), stat: null, text } };
  }
  const script = `[ -e "$1" ] || exit 4; s=$(${STAT}) || exit 5; printf '%s\\n' "$s"; [ "\${s%%|*}" -le "$2" ] || exit 0; sha256sum < "$1" | cut -d' ' -f1; cat -- "$1"`;
  const r = await sh(on, script, [path, String(TEXT_LIMIT)]);
  if (r.code === 4) return { exists: false };
  if (r.code !== 0) throw readFailure(r.stderr.trim() || `読み込みに失敗した（${r.code}）`, sizeBefore(r.stdout));
  const [[stat, hash], text] = splitHead(r.stdout, 2);
  const size = sizeOf(stat);
  if (size > TEXT_LIMIT) return { exists: true, size };
  return { exists: true, size, text, base: { hash, stat } };
}

// ディスクが基準（base）から変わったか。{ missing } か { changed, base }（changed なら新しい基準）。
// このコンピュータでは、画像のコピーで取った基準（bytes）はバイト列のハッシュで比べる。
// 基準が無いときは bytes で選ぶ（開いたときに無かった画像など）。
export async function checkChanged(path, on, base, { bytes = false } = {}) {
  if (!on && (base ? base.bytes : bytes)) {
    const r = await exec("powershell", ["-NoProfile", "-Command",
      `$ErrorActionPreference='Stop'; $p=${psQuote(path)}; if (-not (Test-Path -LiteralPath $p)) { 'missing'; exit 0 }; (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower()`]);
    const out = r.stdout.trim();
    if (r.code !== 0 || out === "missing" || !out) return { missing: true };
    return { missing: false, changed: out !== base?.hash, base: { hash: out, stat: null, bytes: true } };
  }
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
  const h = await sh(on, `sha256sum < "$1" | cut -d' ' -f1`, [path]);
  if (h.code !== 0) return { missing: true };
  const hash = h.stdout.trim();
  return { missing: false, changed: hash !== base?.hash, base: { hash, stat } };
}

// 大きさと更新時刻（中身は読まない）。開けないファイルの変化を見る。無ければ null。
export async function statOf(path, on) {
  if (!on) {
    const r = await exec("powershell", ["-NoProfile", "-Command",
      `$i=Get-Item -LiteralPath ${psQuote(path)} -ErrorAction SilentlyContinue; if ($i) { "$($i.Length)|$($i.LastWriteTimeUtc.Ticks)" } else { 'missing' }`]);
    const out = r.stdout.trim();
    return r.code !== 0 || out === "missing" || !out ? null : out;
  }
  const r = await sh(on, `${STAT} 2>/dev/null || echo missing`, [path]);
  const out = r.stdout.trim();
  return out === "missing" || !out ? null : out;
}

// ファイルのバイト列が UTF-8 として正しいか。確かめられなかったとき（コマンドの失敗など）は null。
// バイト列は base64 で運ぶ（画像の運搬と同じ。テキストの上限 1 MiB は base64 で約 1.4 MB）。
const UTF8_CHUNK = 250_000;
export async function checkUtf8(path, on) {
  const r = !on
    ? await exec("powershell", ["-NoProfile", "-Command", `$ErrorActionPreference='Stop'; [Convert]::ToBase64String([IO.File]::ReadAllBytes(${psQuote(path)}))`])
    : await sh(on, `base64 -w0 -- "$1"`, [path]);
  if (r.code !== 0) return null;
  const checker = utf8Checker();
  for (let i = 0; i < r.stdout.length; i += UTF8_CHUNK) {
    checker.feed(r.stdout.slice(i, i + UTF8_CHUNK));
    // 非同期処理は約 0.5 秒続けて動くと黙って止まり、マイクロタスクの await では区切れない（ガイドの「制約」）。
    // ファイルの有無の確認（実際の入出力）を挟んで区切る。
    await fs.exists(appHome());
  }
  return checker.result();
}

// パスが指すものの種類（中身は読まない。リンクは指す先で見る）。"file" / "folder" / "missing"。リンク先を見る。
export async function pathKind(path, on) {
  const r = !on
    ? await exec("powershell", ["-NoProfile", "-Command",
      `$p=${psQuote(path)}; if (Test-Path -LiteralPath $p -PathType Leaf) { 'file' } elseif (Test-Path -LiteralPath $p -PathType Container) { 'folder' } else { 'missing' }`])
    : await sh(on, `if [ -f "$1" ]; then echo file; elif [ -d "$1" ]; then echo folder; else echo missing; fi`, [path]);
  const out = r.stdout.trim();
  return r.code === 0 && (out === "file" || out === "folder") ? out : "missing";
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
  // 実体のパスと一時ファイルの名前は、どのスクリプトでも引数（パスと JS で決めた接尾辞）から組み立て直す。
  // 標準出力でパスを読み戻すと、改行を含む名前で別のファイルを取り違えるため。
  const suffix = randomUUID();
  const prep = await sh(on, `${LOCATE}; [ -e "$real" ] && [ ! -w "$real" ] && { echo "書き込み権限が無い" >&2; exit 2; }; [ -w "$d" ] || { printf 'フォルダに書き込めない: %s\\n' "$d" >&2; exit 2; }; if [ -e "$t" ] || [ -L "$t" ]; then echo "一時ファイルの名前がすでに使われている" >&2; exit 1; fi; set -C; printf '' > "$t" || exit 1`, [path, suffix]);
  if (prep.code !== 0) throw new Error(prep.stderr.trim() || "保存の準備に失敗した");
  try {
    for (const part of splitForWrite(text)) {
      const r = await sh(on, `${LOCATE}; [ -f "$t" ] && [ ! -L "$t" ] || { echo "一時ファイルが無い" >&2; exit 1; }; printf '%s' "$3" >> "$t"`, [path, suffix, part]);
      if (r.code !== 0) throw new Error(r.stderr.trim() || "書き込みに失敗した");
    }
  } catch (e) {
    await sh(on, `${LOCATE}; rm -f -- "$t"`, [path, suffix]).catch(() => {});
    throw e;
  }
  const finish = `${LOCATE}; want=$3
if [ -n "$want" ]; then
  [ -e "$real" ] || { rm -f -- "$t"; echo missing; exit 3; }
  [ "$(sha256sum < "$real" | cut -d' ' -f1)" = "$want" ] || { rm -f -- "$t"; echo stale; exit 3; }
  chmod --reference="$real" -- "$t" 2>/dev/null
else
  [ -e "$real" ] && { rm -f -- "$t"; echo exists; exit 3; }
fi
h=$(sha256sum < "$t" | cut -d' ' -f1)
mv -f -- "$t" "$real" || { rm -f -- "$t"; exit 1; }
printf '%s\\n' "$h"; ${STAT.replace('"$1"', '"$real"')}`;
  const r = await sh(on, finish, [path, suffix, base?.hash ?? ""]);
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
    return { exists: true, size: Number(size), base: { hash, stat: null, bytes: true }, cache: `${CACHE_DIR}/${name}`, header: base64ToBytes(header) };
  }
  const script = `[ -e "$1" ] || exit 4; s=$(${STAT}) || exit 5; printf '%s\\n' "$s"; [ "\${s%%|*}" -le "$2" ] || exit 0; sha256sum < "$1" | cut -d' ' -f1; base64 -w0 -- "$1"`;
  const r = await sh(on, script, [path, String(IMAGE_LIMIT)]);
  if (r.code === 4) return { exists: false };
  if (r.code !== 0) throw readFailure(r.stderr.trim() || "画像を読めなかった", sizeBefore(r.stdout));
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

// ---- 下書き（app home の file-viewer-drafts/ に置く。ファイルの形は lib/draft-store.js） ----

const draftsDir = () => `${appHome()}/${DRAFTS_DIR}`;
const drafts = createDraftStore(fs, draftsDir);

// mark: 同じタブ・同じファイルでも、別の編集の下書きと名前を分けるための印（無くてもよい）。
export function draftName(token, machine, path, mark = "") {
  return `${token}-${textHash(`${machine ?? ""}\n${path}`).slice(0, 16)}${mark ? `-${mark}` : ""}.json`;
}

// すべての下書き。各下書きに name（下書きの名前）を付ける。
export const listDrafts = () => drafts.list();

export async function writeDraft(draft) {
  const { name: given, ...body } = draft;
  await drafts.write(given ?? draftName(draft.token, draft.machine, draft.path), body);
}

export const deleteDraft = (name) => drafts.remove(name);
