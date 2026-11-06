// 下書き（未保存の編集を本体とは別に残したもの）の見分け方と寿命、復元する内容。
// 下書きは { machine, path, content, bom, base, updatedAt, token } の形。
import { splitBom } from "./save.js";

export const DRAFT_LIFETIME = 30 * 86_400_000;

// そのファイルの下書きのうち、開いているほかの viewer のタブのものを除いて新しい順に返す。
// openTokens: 開いている viewer のタブの token。selfToken: 尋ねているタブの token（自分の下書きは含める）。
export function draftsFor({ drafts, machine, path, openTokens, selfToken }) {
  return drafts
    .filter((d) => d.machine === machine && d.path === path)
    .filter((d) => d.token === selfToken || !openTokens.has(d.token))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function expiredDrafts(drafts, now) {
  return drafts.filter((d) => now - d.updatedAt > DRAFT_LIFETIME);
}

// 復元する内容と、ファイルが無いときに保つ BOM の有無。BOM は Editor に見せないので、内容の先頭の BOM（U+FEFF）は外す
// （前の版の下書きは、ファイルの BOM を内容の先頭に含み、BOM の有無を記録していない）。
// bom: 下書きに記録した有無。記録が無ければ、内容の先頭に BOM があったか。
export function restoredDraft(draft) {
  const { bom, text } = splitBom(draft.content);
  return { text, bom: draft.bom ?? bom };
}
