import { describe, expect, test } from "bun:test";
import { liveTokens } from "../mods/file-viewer/lib/records.js";

// 仕様の「画像の置き場所」の片付け: 見張りは、開いているタブ（記録のうち、今ある viewer のペインに結びついているものと、
// 開いたばかりで名乗り待ちのもの）のどれの印でもない絵のファイルを片付ける。
describe("開いているタブの token", () => {
  test("pane が今ある記録と、pane の無い（名乗り待ちの）記録を含み、閉じたタブの記録を含まない", () => {
    const records = {
      open: { pane: "p1", machine: "wsl" },
      pending: { pane: null, machine: "wsl", createdAt: 1 },
      closed: { pane: "p9", machine: "wsl", missingSince: 5 },
    };
    expect(liveTokens({ records, livePanes: new Set(["p1", "p2"]) })).toEqual(new Set(["open", "pending"]));
  });

  test("space と machine を問わない", () => {
    const records = { a: { pane: "p1", machine: "wsl", space: "s1" }, b: { pane: "p2", machine: "", space: "s2" } };
    expect(liveTokens({ records, livePanes: new Set(["p1", "p2"]) })).toEqual(new Set(["a", "b"]));
  });
});
