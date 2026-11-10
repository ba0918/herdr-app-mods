// 画像の先頭のバイト列（SVG は文字列）からピクセル寸法を読む。読めなければ null。
// mod の実行環境では Buffer / TextEncoder が当てにならないので、純 JS で扱う。
import { readSvgRoot } from "./svg-root.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DECODE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

// base64 の文字列をバイト列にする。max を渡せば先頭の max バイトだけ戻す。
export function base64ToBytes(text, max = Infinity) {
  const out = [];
  let buffer = 0, bits = 0;
  for (let i = 0; i < text.length && out.length < max; i++) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? DECODE[code] : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

const u16be = (b, i) => (b[i] << 8) | b[i + 1];
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b, i) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const i32le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
const text = (b, i, n) => String.fromCharCode(...Array.from(b.slice(i, i + n)));

function png(b) {
  if (b.length < 24 || b[0] !== 0x89 || text(b, 1, 3) !== "PNG" || text(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function gif(b) {
  if (b.length < 10 || text(b, 0, 4) !== "GIF8") return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

function bmp(b) {
  if (b.length < 26 || text(b, 0, 2) !== "BM") return null;
  return { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)) };
}

function ico(b) {
  if (b.length < 8 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1 || b[3] !== 0 || u16le(b, 4) === 0) return null;
  return { width: b[6] || 256, height: b[7] || 256 };
}

function jpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    // SOF0〜SOF15（DHT / JPG / DAC を除く）に寸法がある。
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b) {
  if (b.length < 16 || text(b, 0, 4) !== "RIFF" || text(b, 8, 4) !== "WEBP") return null;
  const chunk = text(b, 12, 4);
  if (chunk === "VP8 " && b.length >= 30) return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  if (chunk === "VP8L" && b.length >= 25) {
    const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === "VP8X" && b.length >= 30) return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  return null;
}

// SVG の書かれた大きさ（書き直しと同じ読み方。lib/svg-root.js）。決められなければ null。
function svg(source) {
  const root = readSvgRoot(source);
  return root.kind === "rewrite" ? { width: root.width, height: root.height } : null;
}

export function imageSize({ bytes, svg: source }) {
  if (source !== undefined) return svg(source);
  for (const read of [png, jpeg, gif, webp, bmp, ico]) {
    const size = read(bytes);
    if (size && size.width > 0 && size.height > 0) return size;
  }
  return null;
}
