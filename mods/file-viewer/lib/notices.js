// タブの中の知らせが重なったときの、外部変更の知らせの出し方。
// 外部変更の知らせは、ほかの知らせ（保存前の確認、作り直す確認、保存の失敗、下書きの後の変化）と別に持つ。

// 選択を待つ知らせ。出ている間は外部変更を知らせず、出ていた外部変更の知らせはこれに置き換える。
const WAITING = new Set(["conflict", "recreate"]);

// 2 秒ごとの確認などで、ディスクが変わったかを確かめたあとにすること。
//   dirty: 未保存の編集があるか。changed: ディスクがタブの基準から変わったか。diskHash: 今のディスクの基準。
//   notice: 出ているほかの知らせの種類（無ければ null）。知らせるだけのもの（"error"・"draft-changed"）と
//   「復元 / 破棄」は、出ていても外部変更の知らせを並べて出す。
//   external: 出ている外部変更の知らせが知らせた基準（無ければ null）。
//   dismissed: 「自分の編集を続ける」を選んだ基準。draftNoticed: 「下書きの後にディスクが変わっている」で知らせた基準。
//   restoring: 下書きを復元してから、復元のあとのディスクの確認が返るまでか。
// 戻り値: "reload"（未編集なので読み直す）/ "show"（知らせを出す）/ "update"（出ている知らせの基準だけ新しくする）/
//   "hide"（出ている知らせを消す）/ "none"（何もしない）。
export function externalNoticeAction({ dirty, changed, diskHash, notice, external, dismissed, draftNoticed, restoring }) {
  if (!changed) return "none";
  if (!dirty) return "reload";
  if (WAITING.has(notice)) return external ? "hide" : "none";
  if (external) return "update";
  if (restoring || diskHash === dismissed || diskHash === draftNoticed) return "none";
  return "show";
}
