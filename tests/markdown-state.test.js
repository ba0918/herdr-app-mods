import { describe, expect, test } from "bun:test";
import { MarkdownState } from "../mods/file-viewer/lib/markdown-state.js";
import { prepareAll, startPreparation, fallbackParts } from "../mods/file-viewer/lib/prepare.js";
import { PictureNames, PictureTable, COMPANION_MISSING } from "../mods/file-viewer/lib/pictures.js";

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

// 使っている絵の表（lib/pictures.js）から名前を取る、図のファイル。名前は鍵（図のソースと見た目）を持っている間だけ同じ。
function pictureTable() {
  let t = 1_000;
  return new PictureTable(new PictureNames({ token: "tok", clock: () => t++ }));
}
const tableFileOf = (tb) => (part, look) => {
  const name = tb.name(`${part.source.trim()}@${look.key}`, "svg");
  return { name, path: `pictures/${name}`, width: 10, height: 5 };
};
// 縦に長い図（タイル 2 枚）を、表から名前を取って書き出すファイル。
const tiledFrom = (tb) => (part, look) => {
  const base = `${part.source.trim()}@${look.key}`;
  const tiles = [0, 1].map((i) => { const name = tb.name(`${base}#${i}`, "svg"); return { name, path: `pictures/${name}`, x: 0, y: i * 10, width: 10, height: 10 }; });
  return { name: tiles[0].name, path: tiles[0].path, width: 10, height: 20, tiles };
};
// まだ書いていない SVG を全部書き（表にも書いたことを知らせる）、app がその画像を読み込んだことにする。書いた名前の並び。
function writeAllTo(tb, s) {
  const names = [];
  for (let task; (task = s.writeTask());) { names.push(task.name); tb.writing(task.name); tb.wrote(task.name); s.wrote(task.name, 1); }
  for (const f of s.preloads()) s.loadedImage(f.name, 1);
  return names;
}
// 描画で使う絵を表に渡し、その描画が済んだことにして、手放す名前を取る（main.js の描画と同じ順）。
function drawFrame(tb, s, companion = true) {
  tb.use("md", s.keep());
  tb.drawn(tb.commit());
  return tb.takeReleases(companion);
}

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

  test("区間から戻らなかったら、10 秒たつ前でも見張りが手放し、準備をやり直して整形表示まで進む", () => {
    const { start, stall } = stallable();
    const s = makeState({ start });
    const now = clock(1);
    s.open(big("a"));
    s.tick(0, now);
    stall(s, now);
    now.skip(2_000);
    expect(s.watch(now, true)).toBe(true);
    expect(s.display()).toEqual({ kind: "preparing", notices: [] });
    expect(s.busy).toBe(true);
    finish(s, now);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("a")), notices: [] });
  });

  test("区間から戻らないことが続き、表示している間の時間で 10 秒を超えたら、代わりの整形表示と「終わらなかった」知らせにする", () => {
    const { start, stall } = stallable();
    const s = makeState({ start });
    const now = clock(1);
    s.open(big("a"));
    stall(s, now);
    now.skip(6_000);
    expect(s.watch(now, true)).toBe(true);
    expect(s.display().kind).toBe("preparing");
    stall(s, now);
    now.skip(4_000);
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
    s.tick(0, now);
    now.skip(9_000);
    stall(s, now);
    now.skip(60_000);
    expect(s.watch(now, false)).toBe(true);
    expect(s.display().kind).toBe("preparing");
    finish(s, now);
    expect(s.display()).toEqual({ kind: "formatted", parts: partsOf(big("a")), notices: [] });
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
  // まだ書いていない SVG を全部書き、app がその画像を読み込んだことにする。書いた名前の並び。
  function writeAll(s, now = clock()) {
    const names = [];
    for (let task; (task = s.writeTask());) { names.push(task.name); s.wrote(task.name, now()); }
    for (const f of s.preloads()) s.loadedImage(f.name, now());
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
    s.loadedImage(task.name, now());
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

  test("捨てた準備の図の書き出しが、中身が変わったあとで失敗しても、今の中身の準備は失敗にしない", () => {
    const s = svgState();
    s.open(smallD("a"));
    const task = s.writeTask();
    s.change(smallD("b"));
    s.writeFailed(task.name, "書けない", clock()());
    writeAll(s);
    expect(s.display().kind).toBe("formatted");
    expect(s.display().notices).toEqual([]);
    expect(shownFiles(s)).toEqual(["flowchart LR; b1-->b2@c1|w800"]);
  });

  test("出している SVG が無くなっていたら、新しい名前で書き直し、書けるまで書いていない図と同じに待つ", () => {
    const tb = pictureTable();
    const s = svgState({ fileOf: tableFileOf(tb) });
    s.open(smallD("a"));
    const [before] = writeAll(s);
    s.toSource();
    s.enter();
    tb.lost([before]);
    s.lost([before]);
    expect(s.display()).toEqual({ kind: "preparing", notices: [] });
    const [after] = writeAll(s);
    expect(after).not.toBe(before);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual([after]);
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

  test("描画の外で準備する文書をソース表示で直して戻ると、準備が終わるまで、前に出していた図の SVG も使っている名前に残す", () => {
    const s = svgState();
    const now = clock();
    const prepare = () => { for (let i = 0; i < 1000 && !s.writeTask() && s.busy; i++) s.tick(0, now); };
    s.open(bigD("a"));
    prepare();
    writeAll(s, now);
    const [name] = shownFiles(s);
    s.toSource();
    s.change(withDiagram(big("b"), "a")); // 図は同じで、文章だけ変える
    s.enter();
    expect(s.display().kind).toBe("preparing");
    expect(s.keep().has(name)).toBe(true);
    prepare();
    expect(writeAll(s, now)).toEqual([]); // 中身・色・大きさの変わらない図は書き直さない
    expect(shownFiles(s)).toEqual([name]);
  });

  test("書いた図の画像を app が読み込み終えるまで、その結果を出さず、読み込む間は前の見え方のまま", () => {
    const s = svgState();
    s.open(smallD("a"));
    const task = s.writeTask();
    s.wrote(task.name, 1);
    expect(s.display().kind).toBe("loading");
    expect(s.preloads().map((f) => f.name)).toEqual([task.name]);
    expect(s.loadedImage(task.name, 2)).toBe(true);
    expect(s.display().kind).toBe("formatted");
    expect(s.preloads()).toEqual([]);
  });

  test("画像の読み込みを待つ間は、描画の外で進める処理は要らない（読み込みの知らせを待つ）", () => {
    const s = svgState();
    s.open(smallD("a"));
    expect(s.needsRun).toBe(true);
    s.wrote(s.writeTask().name, 1);
    expect(s.busy).toBe(true);
    expect(s.needsRun).toBe(false);
  });

  test("画像の読み込みを待つ時間も、表示している間だけ 10 秒に数える（見張りで数える）", () => {
    const s = svgState();
    const now = clock(1);
    s.open(smallD("a"));
    s.wrote(s.writeTask().name, now());
    now.skip(30_000);
    expect(s.watch(now, false)).toBe(false);
    expect(s.display().kind).toBe("loading");
    expect(s.watch(now, true)).toBe(false);
    now.skip(9_000);
    expect(s.watch(now, true)).toBe(false);
    now.skip(1_500);
    expect(s.watch(now, true)).toBe(true);
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(smallD("a")), notices: [{ kind: "timeout" }] });
  });
});

describe("テーマが変わったとき（図の色の書き直し）", () => {
  const OLD = { key: "old|w800" };
  const NEW = { key: "new|w800" };
  const fileOf = (part, look) => ({ name: `${part.source.trim()}@${look.key}`, path: `cache/${part.source.trim()}@${look.key}`, width: 10, height: 5 });
  const twoDiagrams = (head) => `small ${head}\n\n\`\`\`mermaid\nflowchart LR; A-->B\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR; C-->D\n\`\`\`\n`;
  function themed() {
    const s = makeState({ fileOf });
    s.setLook(OLD);
    s.open(twoDiagrams("a"));
    for (let task; (task = s.writeTask());) s.wrote(task.name, 1);
    for (const f of s.preloads()) s.loadedImage(f.name, 1);
    return s;
  }
  const shownFiles = (s) => s.display().parts.filter((p) => p.type === "mermaid").map((p) => p.file.name);

  test("そろうまで前の色の結果を出し、そろったらまとめて替わる（「整形中…」にしない）", () => {
    const s = themed();
    s.setLook(NEW);
    const first = s.writeTask();
    s.wrote(first.name, 2);
    s.loadedImage(first.name, 2);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@old|w800", "flowchart LR; C-->D@old|w800"]);
    const second = s.writeTask();
    s.wrote(second.name, 3);
    s.loadedImage(second.name, 3);
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@new|w800", "flowchart LR; C-->D@new|w800"]);
  });

  test("書き出し直しが失敗したら、前の色の結果のまま「図を書き出せなかった」と知らせ、代わりの整形表示にしない", () => {
    const s = themed();
    s.setLook(NEW);
    s.writeFailed(s.writeTask().name, "書けない", 2);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@old|w800", "flowchart LR; C-->D@old|w800"]);
    expect(s.display().notices).toEqual([{ kind: "restyle-write", message: "書けない" }]);
    expect(s.busy).toBe(false);
  });

  test("10 秒で終わらなかったら、前の色の結果のまま「整形の準備が終わらなかった」と知らせ、代わりの整形表示にしない", () => {
    const s = themed();
    const now = clock(1);
    s.setLook(NEW);
    s.tick(0, now);
    now.skip(10_500);
    s.tick(0, now);
    expect(s.display().kind).toBe("formatted");
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@old|w800", "flowchart LR; C-->D@old|w800"]);
    expect(s.display().notices).toEqual([{ kind: "restyle-timeout" }]);
  });

  test("書き直しの途中で見た目が続けて変わったら、10 秒は最後の見た目から数え、最後の見た目の結果を出す", () => {
    const s = themed();
    const now = clock(1);
    const NEWER = { key: "newer|w800" };
    s.setLook(NEW);
    s.tick(0, now);
    now.skip(6_000);
    s.setLook(NEWER);
    s.watch(now, true);
    now.skip(6_000);
    s.watch(now, true);
    expect(s.display().notices).toEqual([]);
    for (let task; (task = s.writeTask());) s.wrote(task.name, now());
    for (const f of s.preloads()) s.loadedImage(f.name, now());
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@newer|w800", "flowchart LR; C-->D@newer|w800"]);
    expect(s.display().notices).toEqual([]);
  });

  test("知らせは、次に書き出せたら消える", () => {
    const s = themed();
    s.setLook(NEW);
    s.writeFailed(s.writeTask().name, "書けない", 2);
    s.setLook(OLD);
    s.setLook(NEW);
    for (let task; (task = s.writeTask());) s.wrote(task.name, 3);
    for (const f of s.preloads()) s.loadedImage(f.name, 3);
    expect(s.display().notices).toEqual([]);
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@new|w800", "flowchart LR; C-->D@new|w800"]);
  });

  test("書き直しの途中で前の色に戻したら、書き直しを終えて前の色の結果のまま出し、あとで「終わらなかった」と知らせない", () => {
    const s = themed();
    const now = clock(1);
    s.setLook(NEW);
    const first = s.writeTask();
    s.wrote(first.name, now());
    s.setLook(OLD);
    expect(s.busy).toBe(false);
    now.skip(10_500);
    s.watch(now, true);
    expect(s.display().notices).toEqual([]);
    expect(shownFiles(s)).toEqual(["flowchart LR; A-->B@old|w800", "flowchart LR; C-->D@old|w800"]);
  });

  test("書き直しの途中で中身が変わったら、新しい中身と新しい色で準備し、それまで前の整形表示を出す", () => {
    const s = themed();
    s.setLook(NEW);
    s.change(twoDiagrams("b"));
    expect(s.display().kind).toBe("previous");
    const names = [];
    for (let task; (task = s.writeTask());) { names.push(task.name); s.wrote(task.name, 2); }
    for (const f of s.preloads()) s.loadedImage(f.name, 2);
    expect(names).toEqual(["flowchart LR; A-->B@new|w800", "flowchart LR; C-->D@new|w800"]);
    expect(s.display().kind).toBe("formatted");
  });
});

describe("タイルに分けて書き出す大きな図", () => {
  // 縦に長い図（タイル 2 枚）を書き出すファイルの代わり。
  const tiled = (part, look) => {
    const base = `${part.source.trim()}@${look.key}`;
    const tiles = [0, 1].map((i) => ({ name: `${base}#${i}`, path: `cache/${base}#${i}`, x: 0, y: i * 10, width: 10, height: 10 }));
    return { name: tiles[0].name, path: tiles[0].path, width: 10, height: 20, tiles };
  };
  const tallDoc = `small 縦に長い図\n\n\`\`\`mermaid\nflowchart TD; A-->B\n\`\`\`\n`;

  test("どのタイルも書いて読み込み終えるまで、その結果を出さず、書くのも読み込ませるのもタイルごと", () => {
    const s = makeState({ fileOf: tiled });
    s.setLook({ key: "k" });
    s.open(tallDoc);
    const first = s.writeTask();
    expect(first.name).toBe("flowchart TD; A-->B@k#0");
    expect(first.file.tiles.length).toBe(2);
    expect(first.part.type).toBe("mermaid");
    s.wrote(first.name, 1);
    const second = s.writeTask();
    expect(second.name).toBe("flowchart TD; A-->B@k#1");
    s.wrote(second.name, 2);
    expect(s.writeTask()).toBe(null);
    expect(s.preloads().map((t) => t.name)).toEqual(["flowchart TD; A-->B@k#0", "flowchart TD; A-->B@k#1"]);
    s.loadedImage("flowchart TD; A-->B@k#0", 3);
    expect(s.display().kind).toBe("loading");
    s.loadedImage("flowchart TD; A-->B@k#1", 4);
    expect(s.display().kind).toBe("formatted");
    expect([...s.keep()].sort()).toEqual(["flowchart TD; A-->B@k#0", "flowchart TD; A-->B@k#1"]);
  });

  test("出しているタイルの 1 枚が無くなっていたら、そのタイルだけを新しい名前で書き直すまで待つ", () => {
    const tb = pictureTable();
    const s = makeState({ fileOf: tiledFrom(tb) });
    s.setLook({ key: "k" });
    s.open(tallDoc);
    const names = [];
    for (let task; (task = s.writeTask());) { names.push(task.name); s.wrote(task.name, 1); }
    for (const t of s.preloads()) s.loadedImage(t.name, 1);
    tb.lost([names[1]]);
    s.lost([names[1]]);
    expect(s.display().kind).toBe("loading");
    const again = s.writeTask().name;
    expect(again).not.toBe(names[1]);
    s.wrote(again, 2);
    expect(s.writeTask()).toBe(null);
  });

  test("2 枚目のタイルの最初の書き出しが失敗しても、代わりの整形表示と「図を書き出せなかった」の知らせになる", () => {
    const s = makeState({ fileOf: tiled });
    s.setLook({ key: "k" });
    s.open(tallDoc);
    s.wrote(s.writeTask().name, 1);
    s.writeFailed(s.writeTask().name, "書けない", 2);
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(tallDoc), notices: [{ kind: "write", message: "書けない" }] });
  });
});

// 仕様の「画像の置き場所」と「描けない図」。付き添いの mod が無いとき、手放す絵の持ち方。
describe("付き添いの mod と使っている絵", () => {
  const LOOK = { key: "c1|w800" };
  const withDiagram = (head, name) => `${head}\n\n\`\`\`mermaid\nflowchart LR; ${name}1-->${name}2\n\`\`\`\n`;
  const smallD = (name, above = "") => withDiagram(`small ${above}`, name);
  const bigD = (name) => withDiagram(big(name), name);
  const fileOf = (part, look) => ({ name: `${part.source.trim()}@${look.key}`, path: `pictures/${part.source.trim()}@${look.key}`, width: 10, height: 5 });
  function svgState(options = {}) {
    const s = makeState({ fileOf, ...options });
    s.setLook(LOOK);
    return s;
  }
  function writeAll(s, now = clock()) {
    const names = [];
    for (let task; (task = s.writeTask());) { names.push(task.name); s.wrote(task.name, now()); }
    for (const f of s.preloads()) s.loadedImage(f.name, now());
    return names;
  }
  const mermaidParts = (s) => s.display().parts.filter((p) => p.type === "mermaid");

  test("書き出しの前に付き添いの mod が無いと分かったら、理由の無い図は「付き添いの mod が入っていない」の描けない図になり、ほかの部分は整形表示のまま", () => {
    const s = svgState();
    s.open(smallD("a"));
    s.companionChecked(false);
    expect(s.display().kind).toBe("formatted");
    expect(s.display().notices).toEqual([]);
    expect(s.display().parts[0].type).toBe("markdown");
    expect(mermaidParts(s)).toEqual([expect.objectContaining({ error: COMPANION_MISSING, fence: expect.stringContaining("a1-->a2") })]);
    expect(s.writeTask()).toBe(null);
    expect(s.busy).toBe(false);
  });

  test("準備を始めるときに付き添いの mod が無いと分かっていれば、図を配置せず、確かめ直してから出す", () => {
    const s = svgState();
    s.companionChecked(false);
    s.open(smallD("a"));
    expect(s.display().kind).toBe("loading");
    expect(s.needsCheck).toBe(true);
    expect(s.writeTask()).toBe(null);
    s.companionChecked(false);
    expect(mermaidParts(s)).toEqual([expect.objectContaining({ error: COMPANION_MISSING })]);
    expect(mermaidParts(s)[0].layout).toBeUndefined();
  });

  test("付き添いの mod を入れたあとは、次に中身が変わったときから普通に図を書く", () => {
    const s = svgState();
    s.companionChecked(false);
    s.open(smallD("a"));
    s.companionChecked(false);
    s.change(smallD("a", "上の行を足した"));
    s.companionChecked(true);
    const now = clock();
    for (let i = 0; i < 100 && !s.writeTask() && s.busy; i++) s.tick(0, now);
    expect(writeAll(s)).toEqual(["flowchart LR; a1-->a2@c1|w800"]);
    expect(mermaidParts(s)[0].file.name).toBe("flowchart LR; a1-->a2@c1|w800");
  });

  test("付き添いの mod が無くても、文法エラーの図は文法エラーのまま", () => {
    const s = svgState();
    s.companionChecked(false);
    s.open("small 誤り\n\n```mermaid\nflowchart LR\nA-->\n```\n");
    s.companionChecked(false);
    expect(mermaidParts(s)[0].error.kind).toBe("syntax");
  });

  test("出している途中で付き添いの mod が無くなり、テーマが変わったら、差し替えで「付き添いの mod が入っていない」の描けない図になり、色の書き出しの失敗は知らせない", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.setLook({ key: "c2|w800" });
    s.companionChecked(false);
    expect(s.display().kind).toBe("formatted");
    expect(s.display().notices).toEqual([]);
    expect(mermaidParts(s)).toEqual([expect.objectContaining({ error: COMPANION_MISSING })]);
    expect(s.busy).toBe(false);
  });

  test("付き添いの mod が無いときは、出している絵のファイルが無くなったと知らされても書き直さず、そのまま出す", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.companionChecked(false);
    s.lost(["flowchart LR; a1-->a2@c1|w800"]);
    expect(s.display().kind).toBe("formatted");
    expect(mermaidParts(s)[0].file.name).toBe("flowchart LR; a1-->a2@c1|w800");
    expect(s.writeTask()).toBe(null);
  });

  test("上限で移ったソース表示の間は、前の絵を使っている名前に含まない", () => {
    const s = svgState();
    s.open(smallD("a"));
    writeAll(s);
    s.change(smallD("a", "OVER"));
    expect(s.display().kind).toBe("source");
    expect([...s.keep()]).toEqual([]);
  });

  test("代わりの整形表示と描けない図は、絵を使っている名前に含まない", () => {
    const s = svgState();
    s.open(smallD("a"));
    s.writeFailed(s.writeTask().name, "書けない", 1);
    expect(s.display().kind).toBe("fallback");
    expect([...s.keep()]).toEqual([]);
    const u = svgState();
    u.open("small 誤り\n\n```mermaid\nflowchart LR\nA-->\n```\n");
    expect([...u.keep()]).toEqual([]);
  });

  test("利用者が選んだソース表示の間は前の絵を含み、その間に中身が上限を超えたら含まなくなる", () => {
    const tb = pictureTable();
    const s = svgState({ fileOf: tableFileOf(tb) });
    s.open(smallD("a"));
    const [a] = writeAllTo(tb, s);
    s.toSource();
    s.change(smallD("b"));
    expect([...s.keep()]).toEqual([a]);
    s.change(smallD("b", "OVER"));
    expect([...s.keep()]).toEqual([]);
    expect(drawFrame(tb, s)).toEqual([a]);
    // 上限を下回って前と同じ中身で整形表示に戻っても、手放した絵は出さず、新しい名前で書く
    s.change(smallD("a"));
    s.enter();
    expect(s.display().kind).not.toBe("formatted");
    expect(writeAllTo(tb, s)).not.toEqual([a]);
  });

  test("テーマを A → B → A と替えると、A に戻ったときは新しい名前で書く（B に替えたときに A の絵を手放している）", () => {
    const tb = pictureTable();
    const s = makeState({ fileOf: tableFileOf(tb) });
    s.setLook({ key: "A" });
    s.open(smallD("a"));
    const [a1] = writeAllTo(tb, s);
    expect(drawFrame(tb, s)).toEqual([]);
    s.setLook({ key: "B" });
    writeAllTo(tb, s);
    expect(drawFrame(tb, s)).toEqual([a1]);
    s.setLook({ key: "A" });
    const [a2] = writeAllTo(tb, s);
    expect(a2).not.toBe(a1);
    expect(mermaidParts(s)[0].file.name).toBe(a2);
  });

  test("替える途中で A に戻り、A の絵をまだ持っていれば、書き直さずに替わる", () => {
    const tb = pictureTable();
    const s = makeState({ fileOf: tableFileOf(tb) });
    s.setLook({ key: "A" });
    s.open(smallD("a"));
    const [a1] = writeAllTo(tb, s);
    drawFrame(tb, s);
    s.setLook({ key: "B" });
    const b = s.writeTask();
    drawFrame(tb, s);
    s.setLook({ key: "A" });
    expect(s.writeTask()).toBe(null);
    expect(s.busy).toBe(false);
    expect(mermaidParts(s)[0].file.name).toBe(a1);
    expect(drawFrame(tb, s)).toEqual([]); // B は書いていないので、手放さずに外すだけ
    expect(tb.has(b.name)).toBe(false);
  });
});
