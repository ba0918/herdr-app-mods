import { describe, expect, test } from "bun:test";
import { externalNoticeAction } from "../mods/file-viewer/lib/notices.js";

// 編集中のタブで、ディスクが基準から変わった（今のディスクの基準は h2）とき。
const base = { dirty: true, changed: true, diskHash: "h2", notice: null, drafts: 0, external: null, dismissed: null, draftNoticed: null, restoring: false };
const act = (patch) => externalNoticeAction({ ...base, ...patch });

describe("externalNoticeAction", () => {
  test("ほかの知らせが無ければ出す", () => {
    expect(act({})).toBe("show");
  });

  test("保存前の確認の 3 択か作り直す確認が出ていれば出さない。閉じたあと、ディスクが基準と違うままなら出す", () => {
    expect(act({ notice: "conflict" })).toBe("none");
    expect(act({ notice: "recreate" })).toBe("none");
    expect(act({ notice: null })).toBe("show");
  });

  test("外部変更の知らせが出ている間にディスクがまた変わっても、知らせは 1 つ（基準だけ新しくなる）", () => {
    expect(act({ external: "h1", diskHash: "h3" })).toBe("update");
  });

  test("外部変更の知らせが出ている間に保存前の確認が開くと、外部変更の知らせは消える", () => {
    expect(act({ external: "h1", notice: "conflict" })).toBe("hide");
    expect(act({ external: "h1", notice: "recreate" })).toBe("hide");
  });

  test("保存の失敗、「下書きの後にディスクが変わっている」、「復元 / 破棄」が出ていても出す", () => {
    expect(act({ notice: "error" })).toBe("show");
    expect(act({ notice: "draft-changed", draftNoticed: "h1" })).toBe("show");
    expect(act({ drafts: 2 })).toBe("show");
  });

  test("「下書きの後にディスクが変わっている」を出したときのディスクの基準のままなら出さない。そこから変われば出す", () => {
    expect(act({ notice: "draft-changed", draftNoticed: "h2" })).toBe("none");
    expect(act({ notice: null, draftNoticed: "h2" })).toBe("none");
    expect(act({ notice: null, draftNoticed: "h2", diskHash: "h3" })).toBe("show");
  });

  test("「自分の編集を続ける」を選んだ変化は出さない", () => {
    expect(act({ dismissed: "h2" })).toBe("none");
    expect(act({ dismissed: "h1" })).toBe("show");
  });

  test("未編集のタブでは出さず、自動で読み直す", () => {
    expect(act({ dirty: false })).toBe("reload");
    expect(act({ dirty: false, notice: "conflict" })).toBe("reload");
  });

  test("下書きの復元のあとのディスクの確認が返るまでは出さない", () => {
    expect(act({ restoring: true })).toBe("none");
  });

  test("ディスクが基準から変わっていなければ何もしない", () => {
    expect(act({ changed: false })).toBe("none");
    expect(act({ changed: false, dirty: false })).toBe("none");
  });
});
