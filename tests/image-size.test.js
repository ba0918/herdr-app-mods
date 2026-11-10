import { describe, expect, test } from "bun:test";
import { imageSize, base64ToBytes } from "../mods/file-viewer/lib/image.js";

const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >>> 8) & 255];
const le24 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];
const le32 = (n) => [...le16(n & 0xffff), ...le16(n >>> 16)];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

const png = (w, h) => [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...ascii("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0];
const gif = (w, h) => [...ascii("GIF89a"), ...le16(w), ...le16(h), 0, 0, 0];
const bmp = (w, h) => [...ascii("BM"), ...le32(0), 0, 0, 0, 0, ...le32(54), ...le32(40), ...le32(w), ...le32(h), 1, 0, 24, 0];
const ico = (w, h) => [0, 0, 1, 0, 1, 0, w & 255, h & 255, 0, 0, 1, 0, 32, 0];
const jpeg = (w, h) => [0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xff, 0xc0, 0, 17, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3];
const webpLossy = (w, h) => [...ascii("RIFF"), ...le32(0), ...ascii("WEBP"), ...ascii("VP8 "), ...le32(0), 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(w), ...le16(h)];
const webpLossless = (w, h) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return [...ascii("RIFF"), ...le32(0), ...ascii("WEBP"), ...ascii("VP8L"), ...le32(0), 0x2f, ...le32(bits)];
};
const webpExtended = (w, h) => [...ascii("RIFF"), ...le32(0), ...ascii("WEBP"), ...ascii("VP8X"), ...le32(10), 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)];

describe("imageSize", () => {
  test("PNG の IHDR から幅と高さを取る", () => {
    expect(imageSize({ bytes: png(1920, 1080) })).toEqual({ width: 1920, height: 1080 });
  });

  test("JPEG の SOF から幅と高さを取る", () => {
    expect(imageSize({ bytes: jpeg(640, 480) })).toEqual({ width: 640, height: 480 });
  });

  test("GIF の論理画面の大きさを取る", () => {
    expect(imageSize({ bytes: gif(32, 16) })).toEqual({ width: 32, height: 16 });
  });

  test("WebP の 3 つの形式（VP8 / VP8L / VP8X）から取る", () => {
    expect(imageSize({ bytes: webpLossy(300, 200) })).toEqual({ width: 300, height: 200 });
    expect(imageSize({ bytes: webpLossless(1000, 750) })).toEqual({ width: 1000, height: 750 });
    expect(imageSize({ bytes: webpExtended(4000, 3000) })).toEqual({ width: 4000, height: 3000 });
  });

  test("BMP は高さが負（上から下）でも絶対値で取る", () => {
    expect(imageSize({ bytes: bmp(100, -50) })).toEqual({ width: 100, height: 50 });
  });

  test("ICO の最初の画像の大きさを取り、0 は 256 と読む", () => {
    expect(imageSize({ bytes: ico(48, 48) })).toEqual({ width: 48, height: 48 });
    expect(imageSize({ bytes: ico(0, 0) })).toEqual({ width: 256, height: 256 });
  });

  test("SVG は width / height 属性、無ければ viewBox から取る", () => {
    expect(imageSize({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24px" height="16">' })).toEqual({ width: 24, height: 16 });
    expect(imageSize({ svg: '<svg viewBox="0 0 120.5 60" width="100%">' })).toEqual({ width: 120.5, height: 60 });
  });

  test("SVG は書き直しと同じ読み方（単位・文字の大きさ・先頭のコメント）で、書かれた大きさを取る", () => {
    expect(imageSize({ svg: '<svg width="100mm" height="1in">' }).width).toBeCloseTo(377.95, 2);
    expect(imageSize({ svg: '<svg font-size="20" width="2em" height="2ex">' })).toEqual({ width: 40, height: 20 });
    expect(imageSize({ svg: '<!-- <svg width="1" height="1"> --><svg width="3" height="4">' })).toEqual({ width: 3, height: 4 });
    expect(imageSize({ svg: '<svg width="50%" height="10">' })).toBeNull();
    expect(imageSize({ svg: '<html width="10" height="10">' })).toBeNull();
  });

  test("壊れたヘッダや読めない形式は null（寸法不明）", () => {
    expect(imageSize({ bytes: png(10, 10).slice(0, 12) })).toBeNull();
    expect(imageSize({ bytes: ascii("hello world, not an image") })).toBeNull();
    expect(imageSize({ svg: "<svg>" })).toBeNull();
  });
});

describe("base64ToBytes", () => {
  test("base64 をバイト列に戻す（先頭だけも取れる）", () => {
    expect([...base64ToBytes("iVBORw0KGgo=")]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect([...base64ToBytes("iVBORw0KGgo=", 3)]).toEqual([0x89, 0x50, 0x4e]);
    expect([...base64ToBytes("iVBO\nRw0K\nGgo=\n")]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
