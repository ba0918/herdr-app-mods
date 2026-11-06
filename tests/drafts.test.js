import { describe, expect, test } from "bun:test";
import { draftsFor, expiredDrafts, DRAFT_LIFETIME } from "../mods/file-viewer/lib/drafts.js";

const draft = (token, updatedAt, over = {}) => ({ machine: "wsl", path: "/r/a.js", content: "x", baseHash: "h", updatedAt, token, ...over });

describe("draftsFor", () => {
  test("machine とパスが同じ下書きを新しい順に返す", () => {
    const drafts = [draft("a", 100), draft("b", 300), draft("c", 200), draft("d", 400, { path: "/r/b.js" }), draft("e", 500, { machine: null })];
    expect(draftsFor({ drafts, machine: "wsl", path: "/r/a.js", openTokens: new Set(), selfToken: "z" }).map((d) => d.token))
      .toEqual(["b", "c", "a"]);
  });

  test("開いているほかの viewer のタブの下書きは除く", () => {
    const drafts = [draft("a", 100), draft("b", 200)];
    expect(draftsFor({ drafts, machine: "wsl", path: "/r/a.js", openTokens: new Set(["b"]), selfToken: "z" }).map((d) => d.token))
      .toEqual(["a"]);
  });

  test("自分の token の下書きは、自分が開いていても含める", () => {
    const drafts = [draft("me", 100), draft("b", 200)];
    expect(draftsFor({ drafts, machine: "wsl", path: "/r/a.js", openTokens: new Set(["me", "b"]), selfToken: "me" }).map((d) => d.token))
      .toEqual(["me"]);
  });
});

describe("expiredDrafts", () => {
  test("最後の更新から 30 日を過ぎたものだけを返す", () => {
    const now = 100 * 86_400_000;
    const drafts = [draft("old", now - DRAFT_LIFETIME - 1), draft("edge", now - DRAFT_LIFETIME), draft("new", now - 1000)];
    expect(DRAFT_LIFETIME).toBe(30 * 86_400_000);
    expect(expiredDrafts(drafts, now).map((d) => d.token)).toEqual(["old"]);
  });
});
