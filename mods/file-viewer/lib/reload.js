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
