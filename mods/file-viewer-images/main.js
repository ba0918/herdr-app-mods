// file-viewer-images: file-viewer が画像のコピーと図の SVG を置くためだけの、何も表示しない付き添いの mod。
// app は mods/ の下のアセットが書き換えられると絵を取り直して前の絵を放すので、file-viewer は使わなくなった絵をこのフォルダで
// ごく小さい絵に書き換えて手放す（仕様の「画像の置き場所」）。このフォルダの JavaScript は読み直されても何も持たない。
import { View, div } from "gpui-kit";

export default class FileViewerImages extends View {
  render() {
    return div();
  }
}
