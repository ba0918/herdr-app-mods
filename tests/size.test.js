import { describe, expect, test } from "bun:test";
import { limitMessage } from "../mods/file-viewer/lib/size.js";
import { TEXT_LIMIT, IMAGE_LIMIT } from "../mods/file-viewer/lib/kind.js";

describe("limitMessage", () => {
  test("テキストの上限超えは上限とファイルの大きさを MiB で出す", () => {
    expect(limitMessage({ limit: TEXT_LIMIT, size: 2 * 1024 * 1024 })).toBe("大きすぎる（上限 1 MiB、このファイル 2.0 MiB）");
  });

  test("画像の上限はバイト数で出す", () => {
    expect(limitMessage({ limit: IMAGE_LIMIT, size: 7_000_000 })).toBe("大きすぎる（上限 6,000,000 バイト、このファイル 6.7 MiB）");
  });
});
