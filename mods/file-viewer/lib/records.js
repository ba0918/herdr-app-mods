// viewer のタブの記録（shared の file-viewer:tabs）の後始末の判断。
// ペインの id が再起動をまたいで同じかは確かめられていないので、見えなくなった記録はすぐ消さない。
export const PENDING_MS = 10_000;
export const STALE_MS = 10 * 60_000;

// records: { [token]: { pane, machine, createdAt, missingSince } }。livePanes: 今ある viewer のペイン。
// readyMachines: layout を読み終えた machine の名前（このコンピュータは ""）。
// unclaimedMachines: どの記録も名乗っていない viewer のペインがある machine の名前。まだ表示されていない
// （名乗っていない）復元タブのペインかもしれないので、その machine の見えなくなった記録は消さない。
// 戻り値: drop（消す token）、mark（見えなくなった時刻を付ける token → 時刻）、unmark（印を外す token）。
export function staleRecords({ records, livePanes, readyMachines, unclaimedMachines = new Set(), now }) {
  const drop = [], mark = {}, unmark = [];
  for (const [token, r] of Object.entries(records)) {
    if (r.pane && livePanes.has(r.pane)) {
      if (r.missingSince) unmark.push(token);
      continue;
    }
    if (!readyMachines.has(r.machine ?? "")) continue;
    if (!r.pane) {
      if (now - (r.createdAt ?? 0) > PENDING_MS * 6) drop.push(token);
      continue;
    }
    if (!r.missingSince) mark[token] = now;
    else if (now - r.missingSince > STALE_MS && !unclaimedMachines.has(r.machine ?? "")) drop.push(token);
  }
  return { drop, mark, unmark };
}
