import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { READ_CHUNK, chunkRanges, base64Length, chunkCommand } from "../mods/file-viewer/lib/remote-read.js";
import { IMAGE_LIMIT } from "../mods/file-viewer/lib/kind.js";

// ほかの machine の exec の出力の上限（v0.1.15 の src/mods.rs の EXEC_OUTPUT）。
const EXEC_OUTPUT = 8 * 1024 * 1024;

describe("chunkRanges", () => {
  test("空のファイルは区切りが無い", () => {
    expect(chunkRanges(0)).toEqual([]);
  });

  test("1 区切りに収まるファイルは区切り 1 つ", () => {
    expect(chunkRanges(1)).toEqual([{ offset: 0, length: 1 }]);
    expect(chunkRanges(READ_CHUNK)).toEqual([{ offset: 0, length: READ_CHUNK }]);
  });

  test("区切りを超えたら、続きを次の区切りにする", () => {
    expect(chunkRanges(READ_CHUNK + 1)).toEqual([{ offset: 0, length: READ_CHUNK }, { offset: READ_CHUNK, length: 1 }]);
  });

  test("画像の上限の大きさは、区切りの長さの合計がファイルの大きさになる", () => {
    const ranges = chunkRanges(IMAGE_LIMIT);
    expect(ranges.reduce((sum, r) => sum + r.length, 0)).toBe(IMAGE_LIMIT);
    ranges.forEach((r, i) => expect(r.offset).toBe(i * READ_CHUNK));
  });
});

describe("READ_CHUNK", () => {
  test("3 の倍数なので、区切りごとの base64 をつないでも 1 つの base64 になる", () => {
    expect(READ_CHUNK % 3).toBe(0);
  });

  test("1 区切りの base64 が、JSON の中でもう一度 base64 になっても exec の出力の上限に収まる（ほかの行の分の余りを残す）", () => {
    expect(base64Length(base64Length(READ_CHUNK)) + 64 * 1024).toBeLessThan(EXEC_OUTPUT);
  });
});

describe("base64Length", () => {
  test("3 バイトごとに 4 文字、端数は = で埋めて 4 文字", () => {
    expect(base64Length(0)).toBe(0);
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });
});

describe("区切りの読み込みのスクリプト", () => {
  const dir = mkdtempSync(join(tmpdir(), "remote-read-"));
  const bytes = Buffer.alloc(10_007);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7919 + 13) & 255;
  const path = join(dir, "a b's.bin");
  writeFileSync(path, bytes);
  const run = (script, args) => {
    const r = spawnSync("sh", ["-c", script, "file-viewer", ...args], { encoding: "utf8" });
    expect(r.status).toBe(0);
    return r.stdout;
  };

  test("区切りごとに読んだ base64 をつなぐと、ファイル全体の base64 になる", () => {
    const chunk = 3 * 1000;
    const ranges = chunkRanges(bytes.length, chunk);
    expect(ranges.length).toBe(4);
    const parts = ranges.map(({ offset, length }) => run(chunkCommand(2, 3), [path, String(offset), String(length)]));
    parts.forEach((part, i) => expect(part.length).toBe(base64Length(ranges[i].length)));
    expect(parts.join("")).toBe(bytes.toString("base64"));
  });

  test("ほかの引数のあとに区切りの位置と長さを渡せる（先頭の区切りを、大きさの確かめと同じ回で読む）", () => {
    expect(run(`printf '%s|' "$2"; ${chunkCommand(3, 4)}`, [path, "x", "6", "5"])).toBe("x|" + bytes.subarray(6, 11).toString("base64"));
  });
});
