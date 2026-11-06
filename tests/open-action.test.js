import { describe, expect, test } from "bun:test";
import { openAction } from "../mods/file-viewer/lib/tabs.js";
import { resolveLink } from "../mods/file-viewer/lib/markdown.js";

const pinned = (id, path) => ({ id, path, preview: false });
const preview = (id, path) => ({ id, path, preview: true });

describe("openAction", () => {
  test("同じファイルのタブがあればそこに切り替え、シングルクリックでは固定タブのまま", () => {
    expect(openAction({ tabs: [pinned("t1", "/r/a.js")], path: "/r/a.js", double: false, currentIndex: 1 }))
      .toEqual({ action: "select", id: "t1", pin: false });
  });

  test("プレビューに出ているファイルをダブルクリックするとそのタブを固定する", () => {
    expect(openAction({ tabs: [preview("t1", "/r/c.js")], path: "/r/c.js", double: true, currentIndex: 1 }))
      .toEqual({ action: "select", id: "t1", pin: true });
  });

  test("固定タブのファイルをダブルクリックしても切り替えるだけ", () => {
    expect(openAction({ tabs: [pinned("t1", "/r/a.js")], path: "/r/a.js", double: true, currentIndex: 1 }))
      .toEqual({ action: "select", id: "t1", pin: false });
  });

  test("プレビュータブがあればシングルクリックでその中身を入れ替える", () => {
    expect(openAction({ tabs: [pinned("t1", "/r/a.js"), preview("t2", "/r/b.js")], path: "/r/c.js", double: false, currentIndex: 1 }))
      .toEqual({ action: "replace", id: "t2", pin: false });
  });

  test("プレビュータブがあればダブルクリックで入れ替えて固定する", () => {
    expect(openAction({ tabs: [preview("t2", "/r/a.js")], path: "/r/d.js", double: true, currentIndex: 3 }))
      .toEqual({ action: "replace", id: "t2", pin: true });
  });

  test("プレビュータブが無ければ今のタブのすぐ右に新しいタブを開く", () => {
    expect(openAction({ tabs: [pinned("t1", "/r/a.js")], path: "/r/b.js", double: false, currentIndex: 1 }))
      .toEqual({ action: "new", preview: true, index: 2 });
    expect(openAction({ tabs: [], path: "/r/b.js", double: true, currentIndex: 3 }))
      .toEqual({ action: "new", preview: false, index: 4 });
  });

  test("Windows のパスでも、ツリーで開いたファイルを Markdown のリンクから開くと既存のタブに切り替える", () => {
    // ツリーは space のフォルダに / でつないだパスを渡す。
    for (const root of ["C:\\Users\\me\\repo", "\\\\server\\share\\repo"]) {
      const tree = `${root}/docs/b.md`;
      const link = resolveLink({ from: `${root}/docs/a.md`, href: "b.md" });
      expect(openAction({ tabs: [pinned("t1", tree)], path: link.path, double: false, currentIndex: 1 }))
        .toEqual({ action: "select", id: "t1", pin: false });
    }
  });

  test("space のフォルダがドライブやファイルシステムの直下でも、ツリーで開いたファイルをリンクから開くと既存のタブに切り替える", () => {
    // 直下のフォルダは区切りで終わるので、ツリーのパスには区切りが 2 つ続く。
    for (const root of ["C:\\", "D:/", "\\\\server\\share\\", "/"]) {
      const tree = `${root}/docs/b.md`;
      const link = resolveLink({ from: `${root}/docs/a.md`, href: "b.md" });
      expect(openAction({ tabs: [pinned("t1", tree)], path: link.path, double: false, currentIndex: 1 }))
        .toEqual({ action: "select", id: "t1", pin: false });
    }
  });
});
