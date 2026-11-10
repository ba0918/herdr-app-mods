// 前の置き場所（app home 直下の file-viewer-cache/）の片付け（仕様の「画像の置き場所」の「片付け」）。絵は今は絵の席（lib/seats.js）に
// 書く。前の置き場所は mods/ の外なので、消しても app は絵を放さない（出している絵はもう無いので、空白になる絵も無い）。

// 前の置き場所（app home 直下の file-viewer-cache/）で使っていた名前の形: <token>[~<窓の印>]-<ハッシュ 12 桁>.<拡張子>[.b64]。
export const OLD_CACHE_DIR = "file-viewer-cache";
const OLD_CACHE_NAME = /^(.+?)(?:~([0-9a-z]+))?-[0-9a-f]{12}\.[^.]+(?:\.b64)?$/;

// 前の置き場所で消すファイル（file-viewer が書いた名前の形のものだけ）。
export function oldCacheNames(names) {
  return names.filter((name) => OLD_CACHE_NAME.test(name));
}
