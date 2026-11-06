import { describe, expect, test } from "bun:test";
import { tabTitles } from "../mods/file-viewer/lib/tabs.js";

describe("tabTitles", () => {
  test("プレビュータブは先頭に ◇ を付けたファイル名", () => {
    expect(tabTitles([{ id: "t1", path: "/r/src/main.js", preview: true, dirty: false }])).toEqual({ t1: "◇ main.js" });
  });

  test("未保存の編集があるタブは末尾に ● を付ける", () => {
    expect(tabTitles([{ id: "t1", path: "/r/src/main.js", preview: false, dirty: true }])).toEqual({ t1: "main.js ●" });
  });

  test("同じ space に同じファイル名が 2 つあるときだけ親フォルダ名を添える", () => {
    expect(tabTitles([
      { id: "t1", path: "/r/mods/files/main.js", preview: false, dirty: false },
      { id: "t2", path: "/r/mods/tabs/main.js", preview: true, dirty: true },
      { id: "t3", path: "/r/README.md", preview: false, dirty: false },
    ])).toEqual({ t1: "main.js · files", t2: "◇ main.js · tabs ●", t3: "README.md" });
  });

  test("Windows のパスでもファイル名と親フォルダ名を取る", () => {
    expect(tabTitles([
      { id: "a", path: "C:\\w\\x\\main.js", preview: false, dirty: false },
      { id: "b", path: "C:\\w\\y\\main.js", preview: false, dirty: false },
    ])).toEqual({ a: "main.js · x", b: "main.js · y" });
  });
});
