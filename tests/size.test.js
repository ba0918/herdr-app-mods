import { describe, expect, test } from "bun:test";
import { limitMessage, formatSizes } from "../mods/file-viewer/lib/size.js";
import { TEXT_LIMIT, IMAGE_LIMIT } from "../mods/file-viewer/lib/kind.js";

describe("limitMessage", () => {
  test("テキストの上限超えは上限とファイルの大きさを MiB で出す", () => {
    expect(limitMessage({ limit: TEXT_LIMIT, size: 2 * 1024 * 1024 })).toBe("大きすぎる（上限 1 MiB、このファイル 2.0 MiB）");
  });

  test("画像の上限はバイト数で出す", () => {
    expect(limitMessage({ limit: IMAGE_LIMIT, size: 7_000_000 })).toBe("大きすぎる（上限 6,000,000 バイト、このファイル 6.7 MiB）");
  });
});

describe("formatSizes", () => {
  test("上限と今の大きさが丸めると同じになるときは、両方をバイト数で出して違いが読み取れる", () => {
    const [limit, size] = formatSizes(229_153, 229_200);
    expect(limit).not.toBe(size);
    expect(limit.replace(/\D/g, "")).toBe("229153");
    expect(size.replace(/\D/g, "")).toBe("229200");
  });
});
