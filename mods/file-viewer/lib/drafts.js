// 下書き（未保存の編集を本体とは別に残したもの）の見分け方と寿命。
// 下書きは { machine, path, content, base, updatedAt, token } の形。
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
