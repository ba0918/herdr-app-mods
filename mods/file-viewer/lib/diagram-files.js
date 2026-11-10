// 図の SVG のファイルの名前と書き出しの大きさ（仕様の「描き方」）。
// SVG は絵の席（lib/seats.js の IMAGES_DIR の下）に書く。名前は絵の席の表から、図のソース・色・書き出しの大きさ（とタイルの位置）の
// 見た目の鍵で取る。表がその鍵の絵を持っている間は同じ絵の席で、書き直さない。
// 図の 1 行目の行番号は鍵に入れない（配置に効かないので、図より上の行が変わっても書き直さない）。
import { IMAGES_DIR } from "./seats.js";

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

// 書き直す SVG（image viewer）のタイルの数の上限。細長い SVG で、面積は上限に収まってもタイルを作りすぎないように。
export const MAX_TILES = 64;

// 倍率で書き出す絵の、拡大の倍率の上限（面積が MAX_AREA に収まる倍率）。
export function maxDiagramScale(layout) {
  return Math.sqrt(MAX_AREA / (layout.width * layout.height));
}

// 書き直す SVG の、倍率の上限。面積が MAX_AREA に、長い辺が MAX_TILES 枚のタイルの長さに収まる倍率（面積が収まれば、長い辺が
// TILE_SIDE を超えるとき短い辺は TILE_SIDE より短く、タイルは 1 列に並ぶので、長い辺の上限がタイルの数の上限になる）。
export function maxSvgScale(layout) {
  return Math.min(maxDiagramScale(layout), (MAX_TILES * TILE_SIDE) / Math.max(layout.width, layout.height));
}

// 書き直す SVG を、上限の倍率で短い辺が 1 px 以上に書けるか（縦横の比が極端でないか）。
export function svgDrawable(layout) {
  return Math.min(layout.width, layout.height) * maxSvgScale(layout) >= 1;
}

// 配置の大きさ { width, height } を、見た目で書き出す大きさ（整数の px）。倍率で書き出す絵（拡大の窓・.mmd）は拡大の上限まで。
// 本文の図は本文の幅より大きくしないので、上限を当てない。
export function exportSize(layout, look) {
  const f = look.fit;
  if (look.maxWidth !== undefined) return scaled(layout, Math.min(1, look.maxWidth / layout.width));
  const asked = look.scale ?? Math.min(f.max, f.width / layout.width, f.height / layout.height);
  return scaled(layout, Math.min(asked, maxDiagramScale(layout)));
}

function scaled(layout, scale, round = Math.round) {
  return { width: Math.max(1, round(layout.width * scale)), height: Math.max(1, round(layout.height * scale)) };
}

// 書き直す SVG の書く大きさ（整数の px）。倍率は maxSvgScale まで。丸めて面積が MAX_AREA を超えたら切り捨てる（切り捨てた大きさは
// 上限の倍率の大きさ以下なので、面積もタイルの数も上限に収まる。短い辺が 1 px 以上に書けること（svgDrawable）は、呼ぶ側が先に確かめる）。
function svgExportSize(layout, look) {
  const f = look.fit;
  const asked = look.scale ?? Math.min(f.max, f.width / layout.width, f.height / layout.height);
  const scale = Math.min(asked, maxSvgScale(layout));
  const size = scaled(layout, scale);
  return size.width * size.height > MAX_AREA ? scaled(layout, scale, Math.floor) : size;
}

// nameOf(key): 見た目の鍵の絵の名前（使っている絵の表から取る）。part: 整形の準備の図の部分（source と layout を持つ）。
// { name, path, width, height, exportWidth, exportHeight, tiles }。width / height は出す大きさ（論理 px）で、書き出しの大きさと同じ。
// tiles: 書き出す SVG の並び { name, key, path, x, y, width, height }（key は名前を取った見た目の鍵。x から height は出す絵の中の位置と
// 大きさ）。上限以下の絵は 1 枚で、name と path はその 1 枚のもの。
export function diagramFile(nameOf, part, look) {
  const size = part.type === "svg" ? svgExportSize(part.layout, look) : exportSize(part.layout, look);
  const base = `${part.source}\n${colorsKey(look.colors)}\n${size.width}x${size.height}`;
  const tiles = [];
  for (let y = 0; y < size.height; y += TILE_SIDE) {
    for (let x = 0; x < size.width; x += TILE_SIDE) {
      const width = Math.min(TILE_SIDE, size.width - x), height = Math.min(TILE_SIDE, size.height - y);
      const whole = width === size.width && height === size.height;
      const key = whole ? base : `${base}\n${x},${y}`;
      const name = nameOf(key);
      tiles.push({ name, key, path: `${IMAGES_DIR}/${name}`, x, y, width, height });
    }
  }
  return { name: tiles[0].name, path: tiles[0].path, width: size.width, height: size.height, exportWidth: size.width, exportHeight: size.height, tiles };
}

// タイルの位置と大きさ（出す絵の px）を、配置の座標の範囲（SVG の viewBox）にする。
export function tileView(file, tile, layout) {
  const sx = layout.width / file.width, sy = layout.height / file.height;
  return { x: tile.x * sx, y: tile.y * sy, width: tile.width * sx, height: tile.height * sy };
}
