import { offersDrafts } from "./drafts.js";

// タブの内容をディスクから読み直した結果の扱い。
//   editor: タブが Editor で中身を表示しているか。image: 画像のコピーで中身を表示しているか。
//   edited: 読み込みの間に編集されたか。missing: 読み直したらファイルが無かったか。
// 戻り値: "missing"（表示していた中身と未保存の編集を残し、「ファイルが無くなった」にする）/
//   "keep-edits"（読み込みの間に打った文字を捨てないよう、読み直した内容を使わない）/ "replace"（読み直した内容に置き換える）。
export function reloadOutcome({ editor, image, edited, missing }) {
  if (missing && (editor || image)) return "missing";
  if (edited) return "keep-edits";
  return "replace";
}

// 読み直した内容（next）に置き換えるとき、前の file（prev）から引き継ぐもの: 画像と .mmd の図の拡大と位置（枠の大きさも持つ。
// 拡大の部品は枠の大きさが変わったときしか測り直さない）、答えていない「復元 / 破棄」の下書き。
export function carryOver(prev, next) {
  if (prev.zoom && (next.zoom || next.view?.type === "mermaid")) next.zoom = prev.zoom;
  if (prev.drafts?.length && offersDrafts(next)) next.drafts = prev.drafts;
}
