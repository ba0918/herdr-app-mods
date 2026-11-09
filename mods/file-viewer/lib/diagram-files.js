// 図の SVG のファイルの名前と書き出しの大きさ（仕様の「描き方」）。
// SVG は付き添いの mod のフォルダ（lib/pictures.js の IMAGES_DIR）に置く。名前は使っている絵の表（lib/pictures.js の PictureTable）から、
// 図のソース・色・書き出しの大きさ（とタイルの位置）の見た目の鍵で取る。表がその鍵の絵を持っている間は同じ名前で、書き直さない。
// 図の 1 行目の行番号は鍵に入れない（配置に効かないので、図より上の行が変わっても書き直さない）。
import { IMAGES_DIR } from "./pictures.js";

// 画像のコピーの置き場所（app home 直下）。
export const CACHE_DIR = "file-viewer-cache";
// 1 枚の SVG の辺の上限（px）。app は 1 辺 8,192 px までの SVG をくっきり描き、それより大きいと縮めた画像を引き伸ばしてぼやける
// （ガイドの「image(path) の SVG の大きさ」）。これより大きな絵は、この大きさ以下のタイル（同じ絵の viewBox の切れ端）に分けて
// 書き出し、隙間なく並べて出す。引き伸ばした・縮めた絵は出さない（仕様の「描き方」）。
export const TILE_SIDE = 4096;
// 倍率で書き出す絵（拡大の窓・.mmd）の面積の上限（px）。1 枚でくっきり描けた最大の 4,096 × 4,096 と同じにし、拡大の倍率の上限を
// これに収まる倍率にする（大きすぎる画像でメモリを使い切らないように）。
const MAX_AREA = TILE_SIDE * TILE_SIDE;

const COLOR_NAMES = ["background", "foreground", "muted", "raised", "surface", "border"];

// 色の組の鍵（名前に入れる）。
export function colorsKey(colors) {
  return COLOR_NAMES.map((name) => colors?.[name] ?? "").join(",");
}

// 本文の図の見た目: 色と、本文の幅（これより広い図は縮めて書き出す）。key は見た目が変わったかを比べるためのもの。
export function bodyLook(colors, maxWidth) {
  return { colors, maxWidth, key: `${colorsKey(colors)}|w${Math.round(maxWidth)}` };
}

// 倍率で書き出す見た目（拡大の窓・.mmd）。
export function scaleLook(colors, scale) {
  return { colors, scale, key: `${colorsKey(colors)}|s${scale}` };
}

// 枠に収める倍率で書き出す見た目（.mmd の「収まる大きさ」）。frame: { width, height, max }（max: 収めるときの倍率の上限）。
export function fitLook(colors, frame) {
  return { colors, fit: frame, key: `${colorsKey(colors)}|f${Math.round(frame.width)}x${Math.round(frame.height)}x${frame.max}` };
}

// 倍率で書き出す絵の、拡大の倍率の上限（面積が MAX_AREA に収まる倍率）。
export function maxDiagramScale(layout) {
  return Math.sqrt(MAX_AREA / (layout.width * layout.height));
}

// 配置の大きさ { width, height } を、見た目で書き出す大きさ（整数の px）。倍率で書き出す絵（拡大の窓・.mmd）は拡大の上限まで。
// 本文の図は本文の幅より大きくしないので、上限を当てない。
export function exportSize(layout, look) {
  const f = look.fit;
  if (look.maxWidth !== undefined) return scaled(layout, Math.min(1, look.maxWidth / layout.width));
  const asked = look.scale ?? Math.min(f.max, f.width / layout.width, f.height / layout.height);
  return scaled(layout, Math.min(asked, maxDiagramScale(layout)));
}

function scaled(layout, scale) {
  return { width: Math.max(1, Math.round(layout.width * scale)), height: Math.max(1, Math.round(layout.height * scale)) };
}

// nameOf(key): 見た目の鍵の絵の名前（使っている絵の表から取る）。part: 整形の準備の図の部分（source と layout を持つ）。
// { name, path, width, height, exportWidth, exportHeight, tiles }。width / height は出す大きさ（論理 px）で、書き出しの大きさと同じ。
// tiles: 書き出す SVG の並び { name, path, x, y, width, height }（出す絵の中の位置と大きさ）。上限以下の絵は 1 枚で、name と path は
// その 1 枚のもの。
export function diagramFile(nameOf, part, look) {
  const size = exportSize(part.layout, look);
  const base = `${part.source}\n${colorsKey(look.colors)}\n${size.width}x${size.height}`;
  const tiles = [];
  for (let y = 0; y < size.height; y += TILE_SIDE) {
    for (let x = 0; x < size.width; x += TILE_SIDE) {
      const width = Math.min(TILE_SIDE, size.width - x), height = Math.min(TILE_SIDE, size.height - y);
      const whole = width === size.width && height === size.height;
      const name = nameOf(whole ? base : `${base}\n${x},${y}`);
      tiles.push({ name, path: `${IMAGES_DIR}/${name}`, x, y, width, height });
    }
  }
  return { name: tiles[0].name, path: tiles[0].path, width: size.width, height: size.height, exportWidth: size.width, exportHeight: size.height, tiles };
}

// file-viewer-cache/ のファイルの名前（画像のコピー）から、持ち主の token と窓の印を読む。読めなければ null。
const CACHE_NAME = /^(.+?)(?:~([0-9a-z]+))?-[0-9a-f]{12}\.[^.]+(?:\.b64)?$/;
export function svgOwner(name) {
  const m = CACHE_NAME.exec(name);
  return m ? { token: m[1], mark: m[2] ?? null } : null;
}

// タイルの位置と大きさ（出す絵の px）を、配置の座標の範囲（SVG の viewBox）にする。
export function tileView(file, tile, layout) {
  const sx = layout.width / file.width, sy = layout.height / file.height;
  return { x: tile.x * sx, y: tile.y * sy, width: tile.width * sx, height: tile.height * sy };
}
