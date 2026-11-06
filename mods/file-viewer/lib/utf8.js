// ファイルのバイト列が UTF-8 として正しいかの判定。バイト列は exec で base64 にして運ぶ。
// mod の実行環境では Buffer / TextEncoder が当てにならないので純 JS で扱い、1 MiB のファイルでも
// バイト列の配列を作らずに、base64 を戻しながらその場で確かめる。1 MiB 分を続けて確かめると
// 0.5 秒ほどかかり非同期処理が止まる（ガイドの「制約」）ので、呼ぶ側が分けて渡せるようにする。

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DECODE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();
const isSpace = (code) => code === 10 || code === 13 || code === 32 || code === 9;

// base64 のバイト列が UTF-8 として正しいかを、分けて渡された base64 で確かめていく（RFC 3629: 冗長な表現・
// サロゲート・U+10FFFF を超えるもの・途中で切れた列は正しくない）。feed(text) で続きを渡し、result() で
// true / false、base64 として読めなければ null（確かめられなかった）。長い内容を分けて確かめられるようにする。
export function utf8Checker() {
  let buffer = 0, bits = 0, chars = 0, padded = false, broken = false;
  let need = 0, lo = 0x80, hi = 0xbf, valid = true;
  function feed(text) {
    for (let i = 0; i < text.length && !broken; i++) {
      const code = text.charCodeAt(i);
      if (isSpace(code)) continue;
      if (code === 61) { padded = true; continue; }   // "="
      const value = code < 128 ? DECODE[code] : -1;
      if (value < 0 || padded) { broken = true; break; }
      chars++;
      buffer = ((buffer << 6) | value) & 0xffffff;
      bits += 6;
      if (bits < 8) continue;
      bits -= 8;
      if (!valid) continue;
      const byte = (buffer >> bits) & 255;
      if (need > 0) {
        if (byte < lo || byte > hi) { valid = false; continue; }
        need--;
        lo = 0x80; hi = 0xbf;
        continue;
      }
      if (byte < 0x80) continue;
      if (byte >= 0xc2 && byte <= 0xdf) need = 1;
      else if (byte >= 0xe0 && byte <= 0xef) { need = 2; if (byte === 0xe0) lo = 0xa0; else if (byte === 0xed) hi = 0x9f; }
      else if (byte >= 0xf0 && byte <= 0xf4) { need = 3; if (byte === 0xf0) lo = 0x90; else if (byte === 0xf4) hi = 0x8f; }
      else valid = false;
    }
  }
  function result() {
    if (broken || chars % 4 === 1) return null;
    return valid && need === 0;
  }
  return { feed, result };
}

// まとめて渡した base64 のバイト列が UTF-8 として正しいか。utf8Checker と同じ結果。
export function isUtf8Base64(text) {
  const checker = utf8Checker();
  checker.feed(text);
  return checker.result();
}
