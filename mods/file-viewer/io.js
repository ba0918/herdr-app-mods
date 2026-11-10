// space の machine 上のファイルの読み書き。
// 他 machine（WSL・ssh）は exec で sh を動かし、基準（内容の sha256）は machine 側の sha256sum で取る。
// このコンピュータ（machine が null）は readTextFile / writeTextFile と、文字列のハッシュを使う。
import { exec, readTextFile, writeTextFile, appHome } from "herdr";
import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import { TEXT_LIMIT, IMAGE_LIMIT } from "./lib/kind.js";
import { splitForWrite } from "./lib/save.js";
import { base64ToBytes } from "./lib/image.js";
import { createDraftStore } from "./lib/draft-store.js";
import { utf8Checker } from "./lib/utf8.js";

import { OLD_CACHE_DIR } from "./lib/pictures.js";
import { IMAGES_DIR as SEATS_DIR, TINY_SVG } from "./lib/seats.js";

export const DRAFTS_DIR = "file-viewer-drafts";
// このコンピュータの大きなテキストを読むときの一時ファイルのフォルダ（app home の下。readLarge）。
const READ_DIR = "file-viewer-read";
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

// テキストのファイルを読む。{ exists, size, base: { hash, stat, text? }, text, utf8? }。
// 上限（limit。既定はテキストの上限）を超えるときは text を読まずに返す（size だけ）。
// このコンピュータの、テキストの上限（readTextFile の上限）を超えるファイル（1 MiB を超える SVG）は readLarge で読む。UTF-8 として
// 読めなければ、text を空にして utf8: false を返す。
export async function readText(path, on, { limit = TEXT_LIMIT } = {}) {
  if (!on) {
    const size = await localSize(path);
    if (size === null) return { exists: false };
    if (size > limit) return { exists: true, size };
    if (size > TEXT_LIMIT) return readLarge(path, size);
    const text = await readTextFile(path).catch((e) => { throw readFailure(String(e?.message ?? e), size); });
    if (text === null) return { exists: false };
    return { exists: true, size, text, base: { hash: textHash(text), stat: null, text } };
  }
  const script = `[ -e "$1" ] || exit 4; s=$(${STAT}) || exit 5; printf '%s\\n' "$s"; [ "\${s%%|*}" -le "$2" ] || exit 0; sha256sum < "$1" | cut -d' ' -f1; cat -- "$1"`;
  const r = await sh(on, script, [path, String(limit)]);
  if (r.code === 4) return { exists: false };
  if (r.code !== 0) throw readFailure(r.stderr.trim() || `読み込みに失敗した（${r.code}）`, sizeBefore(r.stdout));
  const [[stat, hash], text] = splitHead(r.stdout, 2);
  const size = sizeOf(stat);
  if (size > limit) return { exists: true, size };
  return { exists: true, size, text, base: { hash, stat } };
}

// このコンピュータの、readTextFile の上限を超えるテキストのファイルを読む。PowerShell でバイト列を app home の一時ファイル
// （mods/ の外。mods/ の下にファイルを作ると、出している絵が一瞬空白になる）に写し、fs.readFile で文字列にしてから消す。
// 基準は画像と同じバイト列のハッシュ（変化の確かめを readTextFile で読まないように。checkChanged の bytes）。ハッシュは写したのと
// 同じバイト列から取る（元のファイルを読み直すと、その間に外で書き換わったとき、返す本文と基準が別の中身になり、次の変化を見落とす）。
// fs.readFile は UTF-8 として読めないバイト列で例外を投げる（vendor/gpui-kit/crates/shell/src/engine/quickjs/host.rs の read_file）ので、
// そのときは text を空にして utf8: false を返す（呼ぶ側が UTF-8 でないファイルとして扱う）。ほかの例外は今までどおり投げる。
async function readLarge(path, size) {
  const dir = `${appHome()}/${READ_DIR}`;
  await fs.mkdir(dir, { recursive: true });
  const temp = `${dir}/${randomUUID()}.txt`;
  try {
    const r = await exec("powershell", ["-NoProfile", "-Command",
      `$ErrorActionPreference='Stop'; $p=${psQuote(path)}; if (-not (Test-Path -LiteralPath $p)) { exit 4 }; $b=[IO.File]::ReadAllBytes($p); [IO.File]::WriteAllBytes(${psQuote(temp.replace(/\//g, "\\"))}, $b); "$($b.Length)"; [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($b)).Replace('-','').ToLower()`]);
    if (r.code === 4) return { exists: false };
    if (r.code !== 0) throw readFailure(r.stderr.trim() || "読み込みに失敗した", size);
    const [[length, hash]] = splitHead(r.stdout.replace(/\r/g, ""), 2);
    const base = { hash, stat: null, bytes: true };
    let text;
    try {
      text = await fs.readFile(temp, "utf8");
    } catch (e) {
      if (!/UTF-8/.test(String(e?.message ?? e))) throw e;
      return { exists: true, size: Number(length), text: "", utf8: false, base };
    }
    return { exists: true, size: Number(length), text, base };
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
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

// 長い処理の区切り。非同期処理は約 0.5 秒続けて動くと黙って止まり、マイクロタスクの await では区切れない（ガイドの「制約」）ので、
// 副作用の無い入出力（app home の有無の確認）を待つ。
export async function pauseForApp() {
  await fs.exists(appHome());
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

// 画像を絵の席 seat にコピーする（image() は app home の相対パスしか出せない）。絵の席のファイルを作り直さずにその場で書く（すでにある
// ファイルの書き換えはフォルダの変化の知らせを出さず、同じフォルダのほかの絵が空白にならない。ガイドの「フォルダの変化の知らせ」）。
// このコンピュータのファイルは 1 回の PowerShell で読んで書き、ほかの machine のファイルは base64 で受け取って区切りながらバイト列に戻し、
// fs.writeFile で書く（Uint8Array はそのまま書ける。ガイドの「fs/promises の writeFile」）。
// { exists, size, base, cache: "mods/file-viewer-images/<seat>", header64: 先頭のバイトの base64 }。上限超えは cache なし。
export async function copyImage(path, on, seat) {
  if (!on) {
    const r = await exec("powershell", ["-NoProfile", "-Command",
      `$ErrorActionPreference='Stop'; $p=${psQuote(path)}; if (-not (Test-Path -LiteralPath $p)) { exit 4 }; $b=[IO.File]::ReadAllBytes($p); $h=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower(); "$($b.Length)"; $h; if ($b.Length -le ${IMAGE_LIMIT}) { $f=[IO.File]::Open(${psQuote(seatPath(seat).replace(/\//g, "\\"))}, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::Write); try { $f.Write($b, 0, $b.Length); $f.SetLength($b.Length) } finally { $f.Close() }; [Convert]::ToBase64String($b, 0, [Math]::Min($b.Length, ${HEADER_BYTES})) }`]);
    if (r.code === 4) return { exists: false };
    if (r.code !== 0) throw new Error(r.stderr.trim() || "画像を読めなかった");
    const [[size, hash, header64]] = splitHead(r.stdout.replace(/\r/g, ""), 3);
    if (Number(size) > IMAGE_LIMIT) return { exists: true, size: Number(size) };
    return { exists: true, size: Number(size), base: { hash, stat: null, bytes: true }, cache: `${SEATS_DIR}/${seat}`, header64 };
  }
  const script = `[ -e "$1" ] || exit 4; s=$(${STAT}) || exit 5; printf '%s\\n' "$s"; [ "\${s%%|*}" -le "$2" ] || exit 0; sha256sum < "$1" | cut -d' ' -f1; base64 -w0 -- "$1"`;
  const r = await sh(on, script, [path, String(IMAGE_LIMIT)]);
  if (r.code === 4) return { exists: false };
  if (r.code !== 0) throw readFailure(r.stderr.trim() || "画像を読めなかった", sizeBefore(r.stdout));
  const [[stat, hash], data] = splitHead(r.stdout, 2);
  const size = sizeOf(stat);
  if (size > IMAGE_LIMIT) return { exists: true, size };
  await fs.writeFile(seatPath(seat), await decodeBase64(data, size));
  return { exists: true, size, base: { hash, stat }, cache: `${SEATS_DIR}/${seat}`, header64: data.slice(0, Math.ceil(HEADER_BYTES / 3) * 4) };
}

// base64 の文字列を、区切りながら（区切りごとに入出力を待って）バイト列に戻す（QuickJS は長い同期処理を黙って止めるので。
// ガイドの「長い同期処理」）。size: 戻したバイト数の見込み。
const DECODE_CHARS = 256 * 1024;
async function decodeBase64(text, size) {
  let out = new Uint8Array(size);
  let at = 0;
  for (let i = 0; i < text.length; i += DECODE_CHARS) {
    const part = base64ToBytes(text.slice(i, i + DECODE_CHARS));
    if (at + part.length > out.length) { const grown = new Uint8Array(at + part.length); grown.set(out.subarray(0, at)); out = grown; }
    out.set(part, at);
    at += part.length;
    await pauseForApp();
  }
  return at === out.length ? out : out.slice(0, at);
}

// ---- 前の置き場所（app home 直下の file-viewer-cache/。片付けるだけ） ----

const oldCacheDir = () => `${appHome()}/${OLD_CACHE_DIR}`;

// 前の置き場所のファイルの名前。フォルダが無ければ null。
export async function listOldCache() {
  return fs.readdir(oldCacheDir()).catch(() => null);
}

export async function removeOldCache(name) {
  await fs.unlink(`${oldCacheDir()}/${name}`).catch(() => {});
}

// 前の置き場所のフォルダが空なら消す。
export async function removeOldCacheDir() {
  if ((await listOldCache())?.length === 0) await fs.rmdir(oldCacheDir()).catch(() => {});
}

// ---- 絵の席（mods/file-viewer-images/ の決まった名前のファイル。どれを使うかは lib/seats.js の表） ----

const seatsDir = () => `${appHome()}/${SEATS_DIR}`;
const seatPath = (name) => `${seatsDir()}/${name}`;

// 絵の席のフォルダのファイルの名前。フォルダが無ければ null。
export async function listSeats() {
  return fs.readdir(seatsDir()).catch(() => null);
}

export async function makeSeatsDir() {
  await fs.mkdir(seatsDir(), { recursive: true });
}

// 絵の席に文字列の絵（図の SVG）を上書きで書く（すでにあるファイルをその場で書き換えるので、フォルダの変化の知らせが出ない）。
export async function writeSeatText(name, text) {
  await fs.writeFile(seatPath(name), text);
}

// 絵の席をごく小さい絵で上書きする（手放す。無い絵の席は作る）。失敗した名前を返す。
export async function writeTinySeats(names) {
  const failed = [];
  for (const name of names) await fs.writeFile(seatPath(name), TINY_SVG).catch(() => failed.push(name));
  return failed;
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
