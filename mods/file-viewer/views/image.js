// image viewer の表示と、寸法・ファイルサイズの表記。
import { div, image } from "gpui-kit";
import { v_flex } from "gpui-base";
import { formatSize } from "../lib/size.js";
import { zoomArea } from "./zoom.js";

// 寸法が読めない画像は、この大きさとして枠に収める。
const UNKNOWN = 512;

export function imageInfo(file) {
  const dims = file.dims ? `${Math.round(file.dims.width)} × ${Math.round(file.dims.height)} px` : "寸法不明";
  return `${dims} · ${formatSize(file.size ?? 0)}`;
}

export function imageBody({ file, t }) {
  const width = file.dims?.width ?? UNKNOWN, height = file.dims?.height ?? UNKNOWN;
  return v_flex().id("fv-image").flex_1().min_h(0)
    .child(zoomArea({ id: "fv-image-area", zoom: file.zoom, width, height, t, content: () => image(file.cache).size_full() }))
    .when(Boolean(file.view?.type === "image" && !file.view.source && /svg$/i.test(file.path)), (el) =>
      el.child(div().px(12).py(4).flex_none().text_size(11).text_color(t.dim).child("1 MiB を超える SVG のため、ソースは表示できない")));
}
