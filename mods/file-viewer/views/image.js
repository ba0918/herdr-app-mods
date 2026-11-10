// image viewer の表示と、寸法・ファイルサイズの表記。
import { div, image } from "gpui-kit";
import { v_flex } from "gpui-base";
import { formatSize } from "../lib/size.js";
import { zoomArea } from "./zoom.js";
import { diagramImage, waitingLabel } from "./markdown.js";

// 寸法が読めない画像は、この大きさとして枠に収める。
const UNKNOWN = 512;

export function imageInfo(file) {
  const dims = file.dims ? `${Math.round(file.dims.width)} × ${Math.round(file.dims.height)} px` : "寸法不明";
  return `${dims} · ${formatSize(file.size ?? 0)}`;
}

// svg: 表示の大きさで書き直す SVG の出し方（lib/svg-file.js の svgFileView。"loading" か "picture"）。無ければ、画像のコピー（file.cache）を
// ズームで伸び縮みさせて出す（SVG 以外の画像と、元のままコピーする SVG）。
export function imageBody({ file, svg = null, t }) {
  return v_flex().id("fv-image").flex_1().min_h(0)
    .child(svg ? svgPicture(file, svg, t) : rawPicture(file, t))
    .when(Boolean(file.view?.type === "image" && !file.view.source && /svg$/i.test(file.path)), (el) =>
      el.child(div().px(12).py(4).flex_none().text_size(11).text_color(t.dim).child("1 MiB を超える SVG のため、ソースは表示できない")));
}

function rawPicture(file, t) {
  const width = file.dims?.width ?? UNKNOWN, height = file.dims?.height ?? UNKNOWN;
  return zoomArea({ id: "fv-image-area", zoom: file.zoom, width, height, t, content: () => image(file.cache).size_full() });
}

// 書き直した SVG。書いて読み込むまでは「読み込み中…」を出し、その間も枠の大きさを測る（収まる大きさで書くため）。絵は書いた大きさの
// まま出す（倍率を変えて書き直す間は、前の倍率の絵をその大きさのまま。引き伸ばさない）。
function svgPicture(file, svg, t) {
  const zoom = file.zoom;
  if (svg.kind !== "picture") {
    return waitingLabel(div().id("fv-svg-loading").relative().flex_1().min_h(0).size_full()
      .on_size_change((size, cx) => { if (size.width !== zoom.view?.width || size.height !== zoom.view?.height) { zoom.view = size; cx.notify(); } }), { loading: true, t });
  }
  const { layout, file: picture } = svg.part;
  return zoomArea({
    id: "fv-svg-area", zoom, width: layout.width, height: layout.height, shownScale: picture.width / layout.width, t,
    content: () => diagramImage(picture),
  });
}
