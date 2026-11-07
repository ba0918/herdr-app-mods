import { describe, expect, test } from "bun:test";
import { MarkdownState } from "../mods/file-viewer/lib/markdown-state.js";
import { prepareAll, startPreparation, fallbackParts } from "../mods/file-viewer/lib/prepare.js";

// 大きさの判定の代わり: "small" で始まる文書は描画の中で準備し、"OVER" を含む文書は整形表示の上限を超える。
const OVER = { kind: "bytes", limit: 10, size: 20 };
// 整形表示の上限の知らせ（超えたのがバイト数か図の数かを by に持つ）。
const OVER_NOTICE = { kind: "over", by: "bytes", limit: 10, size: 20 };
const judge = (text) => ({ inRender: text.startsWith("small"), over: text.includes("OVER") ? OVER : null });
// 何単位もかかる大きな文書（描画の外で準備する）。
const big = (name) => `# ${name}\n\n` + Array.from({ length: 5 }, (_, i) => `段落 ${i} ![図](img/${name}-${i}.png)\n`).join("\n");

function clock(step = 1) {
  let t = 0;
  const now = () => (t += step);
  now.skip = (ms) => { t += ms; };
  return now;
}
function makeState(options = {}) {
  return new MarkdownState({ judge, ...options });
}
// 1 区間ずつ（予算 0 で 1 単位ずつ）進めて、終わるまでの区間の数。
function finish(state, now = clock()) {
  for (let n = 1; n < 10000; n++) if (!state.tick(0, now)) return n;
  throw new Error("終わらない");
}
const partsOf = (text) => prepareAll(text).parts;

// 区間から戻らなくなる準備（実機では、await を挟まずに約 0.5 秒を超えた非同期処理を QuickJS が黙って止める。
// ガイドの「長い同期処理」）。stall(state, now) は 1 区間を始めて、区間に入ったところで止め、tick から戻らずに抜ける。
// halt(run) は、run の中で描画の中の準備を始めたところで止め、戻らずに抜ける（実機では、描画の時間を超えた描画を app が
// interrupted で打ち切る。ガイドの「描画の時間」）。
function stallable() {
  let stalling = false, stalled = false, halting = false;
  const start = (text) => {
    if (halting) throw new Error("打ち切られた");
    const prep = startPreparation(text);
    const advance = prep.advance;
    prep.advance = (budget, now) => {
      if (!stalling) return advance(budget, now);
      stalled = true;
      return false;
    };
    return prep;
  };
  const stall = (state, now) => {
    stalling = true;
    expect(() => state.tick(100, () => { if (stalled) throw new Error("止まった"); return now(); })).toThrow("止まった");
    stalling = false;
    stalled = false;
  };
  const halt = (run) => {
    halting = true;
    expect(run).toThrow("打ち切られた");
    halting = false;
  };
  return { start, stall, halt };
}

describe("整形表示に入るとき", () => {
  test("準備が描画の中で済む文書は、すぐ整形表示になる", () => {
    const s = makeState();
    s.open("small # a");
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf("small # a"), notices: [] });
    expect(s.busy).toBe(false);
  });

  test("描画の外で準備する文書は「整形中…」で、準備が終わると整形表示になる", () => {
    const s = makeState();
    s.open(big("a"));
    expect(s.display().kind).toBe("preparing");
    expect(s.busy).toBe(true);
    expect(finish(s)).toBeGreaterThan(3);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("a")), notices: [] });
  });

  test("ソース表示で直してから戻ると、前の中身の整形表示は出さずに「整形中…」になる", () => {
    const s = makeState();
    s.open(big("a"));
    finish(s);
    s.toSource();
    s.change(big("b"));
    s.enter();
    expect(s.display().kind).toBe("preparing");
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("b")), notices: [] });
  });

  test("「整形中…」の間にソース表示へ切り替えても準備は続き、何も変えずに戻ると、済んでいればすぐ整形表示", () => {
    const s = makeState();
    s.open(big("a"));
    s.tick(0, clock());
    s.toSource();
    expect(s.busy).toBe(true);
    finish(s);
    s.enter();
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("a")), notices: [] });
  });

  test("「整形中…」の間にソース表示へ行って何もせず戻ると、途中から続ける", () => {
    const fresh = makeState();
    fresh.open(big("a"));
    const all = finish(fresh);
    const s = makeState();
    s.open(big("a"));
    s.tick(0, clock());
    s.toSource();
    s.enter();
    expect(s.display().kind).toBe("preparing");
    expect(finish(s)).toBe(all - 1);
  });
});

describe("整形表示を出したまま中身が変わるとき", () => {
  test("前の整形表示を出し続け、準備が終わると新しい結果に差し替える", () => {
    const s = makeState();
    s.open(big("a"));
    finish(s);
    s.change(big("b"));
    expect(s.display()).toEqual({ kind: "previous", parts: partsOf(big("a")), notices: [] });
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("b")), notices: [] });
  });

  test("「整形中…」の間に中身が変わると、途中の準備を捨てて今の中身でやり直し、今の中身の結果だけを出す", () => {
    const s = makeState();
    s.open(big("a"));
    s.tick(0, clock());
    s.change(big("b"));
    expect(s.display().kind).toBe("preparing");
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("b")), notices: [] });
  });

  test("前の整形表示を出している間に中身が変わると、途中の準備を最後まで続けて差し替えてから、今の中身でやり直す", () => {
    const s = makeState();
    s.open(big("a"));
    finish(s);
    s.change(big("b"));
    s.tick(0, clock());
    s.change(big("c"));
    // b の準備を続けて差し替える（書き換えが続いても表示が進む）。
    const shows = (name) => JSON.stringify(s.display().parts) === JSON.stringify(partsOf(big(name)));
    for (let i = 0; i < 1000 && shows("a"); i++) s.tick(0, clock());
    expect(s.display()).toEqual({ kind: "previous", parts: partsOf(big("b")), notices: [] });
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("c")), notices: [] });
  });

  test("前の整形表示を出している間に描画の中で済む文書に変わったら、差し替えのあとの描画で今の中身の整形表示になる", () => {
    const s = makeState();
    s.open(big("a"));
    finish(s);
    s.change(big("b"));
    s.change("small c");
    const shows = (name) => JSON.stringify(s.display().parts) === JSON.stringify(partsOf(big(name)));
    for (let i = 0; i < 1000 && shows("a"); i++) s.tick(0, clock());
    s.sync("small c");
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf("small c"), notices: [] });
  });

  test("描画の中で済む文書に変わったら、すぐ差し替える", () => {
    const s = makeState();
    s.open("small 1");
    s.change("small 2");
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf("small 2"), notices: [] });
  });
});

describe("ソース表示の間に中身が変わるとき", () => {
  test("途中の準備を捨て、整形表示に入るまで新しい準備を始めない", () => {
    const s = makeState();
    s.open(big("a"));
    s.tick(0, clock());
    s.toSource();
    s.change(big("b"));
    expect(s.busy).toBe(false);
    s.change(big("c"));
    expect(s.busy).toBe(false);
    s.enter();
    expect(s.busy).toBe(true);
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("c")), notices: [] });
  });
});

describe("表示していないとき", () => {
  test("止めている間の時間は数えず、戻ったら途中から続ける", () => {
    const s = makeState();
    const now = clock(1);
    s.open(big("a"));
    s.tick(0, now);
    s.pause();
    now.skip(60_000);
    expect(s.tick(0, now)).toBe(true);
    finish(s, now);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("a")), notices: [] });
  });
});

describe("失敗したとき", () => {
  test("代わりの整形表示は、今の内容をそのまま 1 つの文章の部分にしたもので、図の部分が無い", () => {
    const text = "# a\n\n```mermaid\nflowchart LR\nA-->B\n```\n\n![図](img/a.png)";
    expect(fallbackParts(text)).toEqual([{ type: "markdown", text }]);
  });

  test("準備を動かしている時間が 10 秒を超えたら、代わりの整形表示と「終わらなかった」知らせにする", () => {
    const s = makeState();
    const now = clock(2_001);
    s.open(big("a"));
    for (let i = 0; i < 5; i++) s.tick(0, now);
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(big("a")), notices: [{ kind: "timeout" }] });
    expect(s.busy).toBe(false);
  });

  test("区間の間の待ち時間も数える", () => {
    const s = makeState();
    const now = clock(1);
    s.open(big("a"));
    s.tick(0, now);
    now.skip(10_000);
    s.tick(0, now);
    expect(s.display().kind).toBe("fallback");
  });

  test("止めている間の時間は 10 秒に数えない", () => {
    const s = makeState();
    const now = clock(1);
    s.open(big("a"));
    s.tick(0, now);
    s.pause();
    now.skip(60_000);
    finish(s, now);
    expect(s.display().kind).toBe("formatted");
  });

  test("次の中身に進んだら 0 から数える", () => {
    const s = makeState();
    const now = clock(1);
    s.open(big("a"));
    s.tick(0, now);
    now.skip(9_000);
    s.tick(0, now);
    s.change(big("b"));
    s.tick(0, now);
    now.skip(9_000);
    s.tick(0, now);
    expect(s.display().kind).toBe("preparing");
  });

  test("区間から戻らないまま、表示している間の時間で 10 秒を超えたら、代わりの整形表示と「終わらなかった」知らせにし、次の準備を始められる", () => {
    const { start, stall } = stallable();
    const s = makeState({ start });
    const now = clock(1);
    s.open(big("a"));
    stall(s, now);
    now.skip(9_000);
    expect(s.watch(now, true)).toBe(false);
    expect(s.display().kind).toBe("preparing");
    now.skip(1_000);
    expect(s.watch(now, true)).toBe(true);
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(big("a")), notices: [{ kind: "timeout" }] });
    s.change(big("b"));
    finish(s, now);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("b")), notices: [] });
  });

  test("区間から戻らない間も、タブを表示していない時間は数えない", () => {
    const { start, stall } = stallable();
    const s = makeState({ start });
    const now = clock(1);
    s.open(big("a"));
    stall(s, now);
    now.skip(60_000);
    expect(s.watch(now, false)).toBe(false);
    expect(s.watch(now, true)).toBe(false);
    expect(s.display().kind).toBe("preparing");
    now.skip(10_001);
    expect(s.watch(now, true)).toBe(true);
    expect(s.display().notices).toEqual([{ kind: "timeout" }]);
  });

  test("区間から戻らなかった準備を、中身が変わって捨てていたら、待たずに次の準備を始められ、今の中身の結果を出す", () => {
    const { start, stall } = stallable();
    const s = makeState({ start });
    const now = clock(1);
    s.open(big("a"));
    stall(s, now);
    s.change(big("b"));
    expect(s.watch(now, true)).toBe(true);
    expect(s.display()).toEqual({ kind: "preparing", notices: [] });
    finish(s, now);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("b")), notices: [] });
  });

  test("区間から戻っている準備は、表示していなくて止めていても、見張りでは終わらせない", () => {
    const s = makeState();
    const now = clock(1);
    s.open(big("a"));
    s.tick(0, now);
    s.pause();
    now.skip(60_000);
    expect(s.watch(now, true)).toBe(false);
    expect(s.display().kind).toBe("preparing");
    expect(s.busy).toBe(true);
  });

  test("開いたときの描画の中の準備が戻らないまま、次の描画が同じ中身で来たら、描画の外の準備に移して整形表示まで進む", () => {
    const { start, halt } = stallable();
    const s = makeState({ start });
    halt(() => s.open("small a"));
    s.sync("small a");
    expect(s.display()).toEqual({ kind: "preparing", notices: [] });
    expect(s.busy).toBe(true);
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf("small a"), notices: [] });
  });

  test("整形表示を出したまま書き換えたときの描画の中の準備が戻らないまま、次の描画が同じ中身で来たら、描画の外の準備に移し、終わらなければ 10 秒で代わりの整形表示にする", () => {
    const { start, stall, halt } = stallable();
    const s = makeState({ start });
    const now = clock(1);
    s.open("small a");
    halt(() => s.change("small b"));
    s.sync("small b");
    expect(s.display()).toEqual({ kind: "previous", parts: partsOf("small a"), notices: [] });
    expect(s.busy).toBe(true);
    stall(s, now);
    now.skip(10_001);
    expect(s.watch(now, true)).toBe(true);
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts("small b"), notices: [{ kind: "timeout" }] });
  });

  test("失敗の知らせは整形表示のときだけ出て、次の準備が失敗せずに終わると消える", () => {
    const s = makeState();
    const now = clock(2_001);
    s.open(big("a"));
    for (let i = 0; i < 5; i++) s.tick(0, now);
    s.toSource();
    expect(s.display().notices).toEqual([]);
    s.enter();
    expect(s.display().notices).toEqual([{ kind: "timeout" }]);
    s.change(big("b"));
    expect(s.display().notices).toEqual([{ kind: "timeout" }]);
    finish(s);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("b")), notices: [] });
  });
});

describe("整形表示の上限", () => {
  const sourceView = (notices, formatButton) => ({ kind: "source", notices, formatButton });

  test("整形表示に入るときに超えていれば、ソース表示と理由の知らせで、整形表示のボタンを出さない", () => {
    const s = makeState();
    s.open("OVER");
    expect(s.display()).toEqual(sourceView([OVER_NOTICE], false));
    expect(s.busy).toBe(false);
  });

  test("整形表示のまま中身が変わって超えたら、ソース表示に移す", () => {
    const s = makeState();
    s.open("small a");
    s.change("small OVER");
    expect(s.display()).toEqual(sourceView([OVER_NOTICE], false));
  });

  test("上限で移したソース表示のまま下回ったら、ソース表示のまま、知らせを消してボタンを出す", () => {
    const s = makeState();
    s.open("OVER");
    s.change("small a");
    expect(s.display()).toEqual(sourceView([], true));
    s.change("small b");
    expect(s.display()).toEqual(sourceView([], true));
    s.enter();
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf("small b"), notices: [] });
  });

  test("利用者が選んだソース表示は、上限を下回っても変えず、超えている間は理由の知らせを出してボタンを出さない", () => {
    const s = makeState();
    s.open("small a", { userSource: true });
    expect(s.display()).toEqual(sourceView([], true));
    s.change("small OVER");
    expect(s.display()).toEqual(sourceView([OVER_NOTICE], false));
    s.change("small b");
    expect(s.display()).toEqual(sourceView([], true));
  });

  test("利用者が選んだソース表示で開いた文書が上限を超えていれば、理由の知らせを出す", () => {
    const s = makeState();
    s.open("OVER", { userSource: true });
    expect(s.display()).toEqual(sourceView([OVER_NOTICE], false));
  });

  test("利用者がソース表示を選んだかを返す（上限で移したソース表示は含めない）", () => {
    const s = makeState();
    s.open("OVER");
    expect(s.userSource).toBe(false);
    s.change("small a");
    s.enter();
    s.toSource();
    expect(s.userSource).toBe(true);
  });
});

describe("図の SVG の書き出し", () => {
  // 見た目（色と大きさ）の代わり。名前は図のソースと見た目の鍵から決まる。
  const LOOK = { key: "c1|w800" };
  const WIDE = { key: "c1|w500" };
  const fileOf = (part, look) => ({ name: `${part.source.trim()}@${look.key}`, path: `cache/${part.source.trim()}@${look.key}`, width: 10, height: 5 });
  const withDiagram = (head, name) => `${head}\n\n\`\`\`mermaid\nflowchart LR; ${name}1-->${name}2\n\`\`\`\n`;
  const smallD = (name, above = "") => withDiagram(`small ${above}`, name);
  const bigD = (name) => withDiagram(big(name), name);
  function svgState(options = {}) {
    const s = makeState({ fileOf, ...options });
    s.setLook(LOOK);
    return s;
  }
  // まだ書いていない SVG を全部書いたことにする。書いた名前の並び。
  function writeAll(s, now = clock()) {
    const names = [];
    for (let task; (task = s.writeTask());) { names.push(task.name); s.wrote(task.name, now()); }
    return names;
  }
  const shownFiles = (s) => s.display().parts.filter((p) => p.type === "mermaid").map((p) => p.file.name);

  test("開くとき、描画の中で済む文書でも、まだ書いていない図があれば読み込み中のまま待ち、書き終えたら整形表示", () => {
    const s = svgState();
    s.open(smallD("a"));
    expect(s.display()).toEqual({ kind: "loading", notices: [] });
    expect(s.busy).toBe(true);
    expect(writeAll(s)).toEqual(["flowchart LR; a1-->a2@c1|w800"]);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual(["flowchart LR; a1-->a2@c1|w800"]);
    expect(s.busy).toBe(false);
  });

  test("図の無い文書は書き出しが無いので、すぐ整形表示", () => {
    const s = svgState();
    s.open("small 図なし");
    expect(s.display().kind).toBe("formatted");
    expect(s.writeTask()).toBe(null);
  });

  test("ソース表示から戻るときは、まだ書いていない図があれば「整形中…」、書き出し済みの図だけならすぐ整形表示", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.toSource();
    s.enter();
    expect(s.display().kind).toBe("formatted");
    s.toSource();
    s.change(smallD("b"));
    s.enter();
    expect(s.display()).toEqual({ kind: "preparing", notices: [] });
    writeAll(s);
    expect(shownFiles(s)).toEqual(["flowchart LR; b1-->b2@c1|w800"]);
  });

  test("整形表示を出したまま中身が変わったら、書き終えるまで前の整形表示を出す", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.change(smallD("b"));
    expect(s.display().kind).toBe("previous");
    expect(shownFiles(s)).toEqual(["flowchart LR; a1-->a2@c1|w800"]);
    writeAll(s);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual(["flowchart LR; b1-->b2@c1|w800"]);
  });

  test("描画の外で準備する文書は、準備のあと全部の図を書き終えてから整形表示を出す", () => {
    const s = svgState();
    s.open(bigD("a"));
    const now = clock();
    for (let i = 0; i < 1000 && !s.writeTask(); i++) s.tick(0, now);
    expect(s.display().kind).toBe("preparing");
    expect(s.busy).toBe(true);
    writeAll(s);
    expect(s.display().kind).toBe("formatted");
  });

  test("書いてある図は書き直さない（図より上の行が変わっても）", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.change(smallD("a", "上の行を足した"));
    expect(s.writeTask()).toBe(null);
    expect(s.display().kind).toBe("formatted");
  });

  test("本文の幅が変わったら、新しい大きさで書けるまで前の大きさの結果を出し、書けたら替える", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.setLook(WIDE);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual(["flowchart LR; a1-->a2@c1|w800"]);
    expect(writeAll(s)).toEqual(["flowchart LR; a1-->a2@c1|w500"]);
    expect(shownFiles(s)).toEqual(["flowchart LR; a1-->a2@c1|w500"]);
  });

  test("見た目が変わっても名前が同じなら、書かずにすぐ替える", () => {
    const sameName = (part, look) => fileOf(part, { key: "same" });
    const s = svgState({ fileOf: sameName });
    s.open(smallD("a"));
    writeAll(s);
    s.setLook(WIDE);
    expect(s.busy).toBe(false);
    expect(s.writeTask()).toBe(null);
  });

  test("書き出しを待つ間に中身が変わると（何も出していないとき）、今の中身の図を書く", () => {
    const s = svgState();
    s.open(smallD("a"));
    s.change(smallD("b"));
    expect(writeAll(s)).toEqual(["flowchart LR; b1-->b2@c1|w800"]);
    expect(shownFiles(s)).toEqual(["flowchart LR; b1-->b2@c1|w800"]);
  });

  test("書き出しを待つ時間も 10 秒に数え、超えたら代わりの整形表示と「終わらなかった」知らせ", () => {
    const s = svgState();
    const now = clock(1);
    s.open(smallD("a"));
    s.tick(0, now);
    now.skip(10_001);
    const task = s.writeTask();
    s.wrote(task.name, now());
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(smallD("a")), notices: [{ kind: "timeout" }] });
  });

  test("表示していなくて止めている間は、書き出しを待つ時間に数えない", () => {
    const s = svgState();
    const now = clock(1);
    s.open(smallD("a"));
    s.tick(0, now);
    s.pause();
    now.skip(60_000);
    const task = s.writeTask();
    s.wrote(task.name, now());
    expect(s.display().kind).toBe("formatted");
  });

  test("最初の書き出しが例外で失敗したら、代わりの整形表示と「図を書き出せなかった（理由）」の知らせ", () => {
    const s = svgState();
    s.open(smallD("a"));
    const task = s.writeTask();
    s.writeFailed(task.name, "書けない", clock()());
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(smallD("a")), notices: [{ kind: "write", message: "書けない" }] });
    expect(s.busy).toBe(false);
  });

  test("出している SVG が無くなっていたら、書き直すまで書いていない図と同じに待つ", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.toSource();
    s.enter();
    s.lost(["flowchart LR; a1-->a2@c1|w800"]);
    expect(s.display()).toEqual({ kind: "preparing", notices: [] });
    expect(writeAll(s)).toEqual(["flowchart LR; a1-->a2@c1|w800"]);
    expect(s.display().kind).toBe("formatted");
  });

  test("出していない SVG が無くなっていても、表示は変えない", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.lost(["ほかの図@c1|w800"]);
    expect(s.display().kind).toBe("formatted");
    expect(s.busy).toBe(false);
  });

  test("使っている SVG の名前は、出している整形表示と、書いている途中の結果のもの", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.change(smallD("b"));
    expect([...s.keep()].sort()).toEqual(["flowchart LR; a1-->a2@c1|w800", "flowchart LR; b1-->b2@c1|w800"]);
    writeAll(s);
    expect([...s.keep()]).toEqual(["flowchart LR; b1-->b2@c1|w800"]);
  });
});
