import { describe, expect, test } from "bun:test";
import { createDraftStore } from "../mods/file-viewer/lib/draft-store.js";

// fs/promises の形をしたメモリ上のフォルダ。failNextWrite を立てると、次の writeFile は途中まで書いて失敗する。
function memoryFs() {
  const files = new Map();
  const state = { failNextWrite: false };
  const key = (path) => path.slice(path.lastIndexOf("/") + 1);
  return {
    state,
    async mkdir() {},
    async readdir() { return [...files.keys()]; },
    async readFile(path) {
      if (!files.has(key(path))) throw new Error("ENOENT");
      return files.get(key(path));
    },
    async writeFile(path, text) {
      if (state.failNextWrite) {
        state.failNextWrite = false;
        files.set(key(path), text.slice(0, Math.floor(text.length / 2)));
        throw new Error("stopped while writing");
      }
      files.set(key(path), text);
    },
    async unlink(path) { files.delete(key(path)); },
  };
}

const NAME = "t-0123456789abcdef.json";
const draft = (content, updatedAt) => ({ machine: "wsl", path: "/r/a.js", content, base: "h", updatedAt, token: "t" });

describe("下書きの書きかけ", () => {
  test("書き込みの途中で失敗しても、1 つ前に書き終えた下書きが読める", async () => {
    const fs = memoryFs();
    const store = createDraftStore(fs, () => "/home/app/file-viewer-drafts");
    await store.write(NAME, draft("one", 1));
    await store.write(NAME, draft("two", 2));
    fs.state.failNextWrite = true;
    await expect(store.write(NAME, draft("three", 3))).rejects.toThrow();

    const drafts = await store.list();
    expect(drafts.map((d) => d.content)).toEqual(["two"]);
  });
});
