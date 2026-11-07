import { describe, expect, test } from "bun:test";
import { reloadOutcome, carryOver } from "../mods/file-viewer/lib/reload.js";

// editor: タブが Editor で中身を表示しているか。image: 画像のコピーで中身を表示しているか。
// edited: 読み込みの間に編集されたか。missing: 読み直したらファイルが無かったか。
const base = { editor: false, image: false, edited: false, missing: false };
const outcome = (patch) => reloadOutcome({ ...base, ...patch });

describe("reloadOutcome", () => {
  test("読み直したらファイルが無かったとき、中身を表示しているタブ（テキストも画像も）は中身を残して「ファイルが無くなった」にする", () => {
    expect(outcome({ editor: true, missing: true })).toBe("missing");
    expect(outcome({ editor: true, edited: true, missing: true })).toBe("missing");
    expect(outcome({ image: true, missing: true })).toBe("missing");
    expect(outcome({ image: true, editor: true, missing: true })).toBe("missing");
  });

  test("中身を表示していない開けないファイルの案内のタブは、無くなったことの案内に置き換える", () => {
    expect(outcome({ missing: true })).toBe("replace");
  });

  test("読み込みの間に打った文字は捨てず、読み直した内容に置き換えない", () => {
    expect(outcome({ editor: true, edited: true })).toBe("keep-edits");
  });

  test("それ以外は読み直した内容に置き換える", () => {
    expect(outcome({ editor: true })).toBe("replace");
    expect(outcome({ image: true })).toBe("replace");
    expect(outcome({})).toBe("replace");
  });
});

describe("carryOver", () => {
  const drafts = [{ name: "d1" }];

  test("読み直した内容に置き換えても、答えていない「復元 / 破棄」の下書きは残る", () => {
    const next = { editor: {} };
    carryOver({ editor: {}, drafts }, next);
    expect(next.drafts).toEqual(drafts);
  });

  test(".mmd の図の拡大と位置（と枠の大きさ）は、読み直しても引き継ぐ", () => {
    const zoom = { scale: 2, view: { width: 100, height: 80 } };
    const next = { editor: {}, view: { type: "mermaid" } };
    carryOver({ editor: {}, view: { type: "mermaid" }, zoom }, next);
    expect(next.zoom).toBe(zoom);
  });

  test("読み直したら読み取り専用になったか、Editor で中身を出せなくなったタブには残さない", () => {
    for (const next of [{ editor: {}, readonly: true }, { view: { type: "unopenable", reason: "binary" } }]) {
      carryOver({ editor: {}, drafts }, next);
      expect(next.drafts).toBeUndefined();
    }
  });
});
