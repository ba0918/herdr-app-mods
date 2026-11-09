import { describe, expect, test } from "bun:test";
import { diagramFileState, diagramFileView, startDiagramPreparation } from "../mods/file-viewer/lib/mmd.js";
import { PictureNames, PictureTable } from "../mods/file-viewer/lib/pictures.js";

const fileOf = (part, look) => ({ name: `${part.source.trim()}@${look.key}`, path: "p", width: 10, height: 5 });
const FLOW = "flowchart LR\n  A-->B\n";
const FLOW2 = "flowchart LR\n  A-->C\n";
const LOOK = { key: "c1|s1" };

function state(options = {}) {
  const s = diagramFileState({ fileOf, ...options });
  s.setLook(LOOK);
  return s;
}
// 準備を進め、書き、読み込んだことにする。
function finish(s, t = 1) {
  for (let i = 0; i < 10 && !s.writeTask() && s.busy; i++) s.tick(100, () => t);
  for (let task; (task = s.writeTask());) s.wrote(task.name, t);
  for (const f of s.preloads()) s.loadedImage(f.name, t);
}
const view = (s, text) => diagramFileView(s.display(), text);

describe(".mmd の図の準備", () => {
  test("ファイル全体を、1 行目から始まる図 1 つとして準備する", () => {
    const prep = startDiagramPreparation(FLOW);
    expect(prep.advance(100, () => 0)).toBe(true);
    expect(prep.parts.length).toBe(1);
    expect(prep.parts[0]).toMatchObject({ type: "mermaid", source: FLOW, firstLine: 1 });
    expect(prep.parts[0].layout.type).toBe("flowchart");
  });

  test("図に入るときは、小さな図でも描画の外で準備し、済むまで準備中", () => {
    const s = state();
    s.open(FLOW);
    expect(view(s, FLOW)).toEqual({ kind: "preparing", notices: [] });
    finish(s);
    const v = view(s, FLOW);
    expect(v.kind).toBe("diagram");
    expect(v.part.file.name).toBe(`${FLOW.trim()}@c1|s1`);
  });

  test("図を出したまま中身が変わったら、前の図を出し続け、済んだら差し替える", () => {
    const s = state();
    s.open(FLOW);
    finish(s);
    s.change(FLOW2);
    expect(view(s, FLOW2).part.source).toBe(FLOW);
    finish(s);
    expect(view(s, FLOW2).part.source).toBe(FLOW2);
  });

  test("倍率が変わったら、書き終えるまで前の倍率の図を出す", () => {
    const s = state();
    s.open(FLOW);
    finish(s);
    s.setLook({ key: "c1|s3" });
    expect(view(s, FLOW).part.file.name).toBe(`${FLOW.trim()}@c1|s1`);
    finish(s);
    expect(view(s, FLOW).part.file.name).toBe(`${FLOW.trim()}@c1|s3`);
  });

  test("10 秒（表示している間）で終わらなければ、描けない図の「図の準備が終わらなかった」になり、中身が変わったらやり直す", () => {
    const s = state();
    const now = (() => { let t = 0; const f = () => (t += 1); f.skip = (ms) => { t += ms; }; return f; })();
    s.open(FLOW);
    s.tick(0, now);
    now.skip(10_500);
    s.tick(0, now);
    expect(view(s, FLOW)).toEqual({ kind: "error", message: "図の準備が終わらなかった", fence: "```\n" + FLOW + "\n```", notices: [] });
    s.change(FLOW2);
    finish(s);
    expect(view(s, FLOW2).kind).toBe("diagram");
  });

  test("図の準備の区間から戻らなかったら（非同期処理が止まった）、10 秒を待たずに手放してやり直し、図を出す", () => {
    const s = state();
    let t = 0, stalled = false;
    const stalling = () => { if (stalled) throw new Error("止まった"); stalled = true; return (t += 1); };
    s.open(FLOW);
    expect(() => s.tick(100, stalling)).toThrow("止まった");
    t += 2_000;
    expect(s.watch(() => t, true)).toBe(true);
    expect(view(s, FLOW)).toEqual({ kind: "preparing", notices: [] });
    finish(s, t);
    expect(view(s, FLOW).kind).toBe("diagram");
  });

  test("最初の書き出しが失敗したら、描けない図の「図を書き出せなかった（理由）」になる", () => {
    const s = state();
    s.open(FLOW);
    s.tick(100, () => 1);
    s.writeFailed(s.writeTask().name, "書けない", 2);
    expect(view(s, FLOW)).toEqual({ kind: "error", message: "図を書き出せなかった（書けない）", fence: "```\n" + FLOW + "\n```", notices: [] });
  });

  test("文法の誤りは、今までどおり描けない図の理由になる", () => {
    const s = state();
    s.open("flowchart LR\n  A-->\n");
    finish(s);
    expect(view(s, "x")).toEqual({ kind: "error", message: "2 行目の文法エラー", fence: "```\nflowchart LR\n  A-->\n\n```", notices: [] });
  });

  test("描けない図を出したまま中身が変わったら、済むまで、理由と同じ中身のコードを出し続ける", () => {
    const s = state();
    const bad = "flowchart LR\n  A-->\n";
    s.open(bad);
    finish(s);
    s.change(FLOW);
    const v = view(s);
    expect(v.message).toBe("2 行目の文法エラー");
    expect(v.fence).toBe("```\n" + bad + "\n```");
  });

  test("テーマの書き出し直しの失敗と時間切れは、前の色の図のまま知らせる", () => {
    const s = state();
    s.open(FLOW);
    finish(s);
    s.setLook({ key: "c2|s1" });
    s.writeFailed(s.writeTask().name, "書けない", 2);
    const v = view(s, FLOW);
    expect(v.kind).toBe("diagram");
    expect(v.part.file.name).toBe(`${FLOW.trim()}@c1|s1`);
    expect(v.notices).toEqual([{ kind: "restyle-write", message: "書けない" }]);

    const u = state();
    const now = (() => { let t = 0; const f = () => (t += 1); f.skip = (ms) => { t += ms; }; return f; })();
    u.open(FLOW);
    finish(u);
    u.setLook({ key: "c2|s1" });
    u.tick(0, now);
    now.skip(10_500);
    u.tick(0, now);
    expect(view(u, FLOW).kind).toBe("diagram");
    expect(view(u, FLOW).notices).toEqual([{ kind: "restyle-timeout" }]);
  });
});

describe(".mmd の付き添いの mod と使っている絵", () => {
  test("付き添いの mod が無いとき、描けない図の「付き添いの mod が入っていない」になる", () => {
    const s = state();
    s.open(FLOW);
    s.tick(100, () => 1);
    s.companionChecked(false);
    expect(view(s, FLOW)).toEqual({ kind: "error", message: "付き添いの mod が入っていない", fence: "```\n" + FLOW + "\n```", notices: [] });
  });

  test("利用者が選んだソース表示の間は、前の絵を使っている名前に含む", () => {
    const s = state();
    s.open(FLOW);
    finish(s);
    s.toSource();
    expect([...s.keep()]).toEqual([`${FLOW.trim()}@c1|s1`]);
  });

  test("倍率を続けて変えて途中の絵が要らなくなったら、その絵は使っている名前から外れる", () => {
    let t = 1_000;
    const tb = new PictureTable(new PictureNames({ token: "tok", clock: () => t++ }));
    const s = diagramFileState({ fileOf: (part, look) => { const name = tb.name(`${part.source}@${look.key}`, "svg"); return { name, path: name, width: 10, height: 5 }; } });
    s.setLook({ key: "s1" });
    s.open(FLOW);
    finish(s);
    const shown = view(s, FLOW).part.file.name;
    s.setLook({ key: "s2" });
    const middle = s.writeTask().name;
    expect(s.keep().has(middle)).toBe(true);
    s.setLook({ key: "s3" });
    expect(s.keep().has(middle)).toBe(false);
    expect(s.keep().has(shown)).toBe(true);
  });
});
