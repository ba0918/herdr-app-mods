// 図の SVG のファイルの名前と書き出しの大きさ（仕様の「描き方」）。
// SVG は画像のコピーと同じ file-viewer-cache/ に、<タブの token>-<ハッシュ 12 桁>.svg の名前で置く。ハッシュは図のソース・色・
// 書き出しの大きさから作るので、どれかが変われば名前が変わり、同じ名前のファイルを上書きしない。図の 1 行目の行番号は入れない
// （配置に効かないので、図より上の行が変わっても書き直さない）。
// 拡大の窓が書くものは、token に窓の印を付けた <token>~<印>-<ハッシュ>.svg にし、持ち主の token は同じに読む。

export const CACHE_DIR = "file-viewer-cache";
// 書き出す SVG の長いほうの辺の上限（px）。app は SVG を画像にして持つので、拡大の窓で大きな倍率にしたときに、大きすぎる画像で
// メモリを使い切らないようにする。超える倍率では、この大きさの絵を引き伸ばして出す。
const MAX_SIDE = 4096;

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

// 配置の大きさ { width, height } を、見た目で書き出す大きさ（整数の px）。
export function exportSize(layout, look) {
  const scale = look.scale ?? Math.min(1, look.maxWidth / layout.width);
  return { width: Math.max(1, Math.round(layout.width * scale)), height: Math.max(1, Math.round(layout.height * scale)) };
}

// 12 桁の 16 進のハッシュ（名前用。暗号の強さは要らない）。2 つの FNV-1a を並べる。
function hash12(text) {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).slice(0, 12);
}

// part: 整形の準備の図の部分（source と layout を持つ）。mark: 拡大の窓の印（無ければタブのもの）。
// { name, path, width, height, exportWidth, exportHeight }。width / height は出す大きさ（論理 px）。
export function diagramFile(token, part, look, mark = null) {
  const size = exportSize(part.layout, look);
  const shrink = Math.min(1, MAX_SIDE / Math.max(size.width, size.height));
  const exportWidth = Math.max(1, Math.round(size.width * shrink)), exportHeight = Math.max(1, Math.round(size.height * shrink));
  const name = `${token}${mark ? `~${mark}` : ""}-${hash12(`${part.source}\n${colorsKey(look.colors)}\n${exportWidth}x${exportHeight}`)}.svg`;
  return { name, path: `${CACHE_DIR}/${name}`, width: size.width, height: size.height, exportWidth, exportHeight };
}

// file-viewer-cache/ のファイルの名前（画像のコピーと図の SVG）から、持ち主の token と窓の印を読む。読めなければ null。
const CACHE_NAME = /^(.+?)(?:~([0-9a-z]+))?-[0-9a-f]{12}\.[^.]+(?:\.b64)?$/;
export function svgOwner(name) {
  const m = CACHE_NAME.exec(name);
  return m ? { token: m[1], mark: m[2] ?? null } : null;
}
