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

  test("画像を押せる名前にする処理が例外を投げたら、代わりの整形表示と理由（例外のメッセージ）の知らせ", () => {
    const broken = (text) => startPreparation(text, { rewriter: () => () => { throw new Error("壊れた"); } });
    const s = makeState({ start: broken });
    s.open(big("a"));
    finish(s);
    expect(s.display()).toEqual({ kind: "fallback", parts: fallbackParts(big("a")), notices: [{ kind: "image", message: "壊れた" }] });
  });

  test("失敗の知らせは整形表示のときだけ出て、次の準備が失敗せずに終わると消える", () => {
    let fail = true;
    const sometimes = (text) => startPreparation(text, fail ? { rewriter: () => () => { throw new Error("壊れた"); } } : {});
    const s = makeState({ start: sometimes });
    s.open(big("a"));
    finish(s);
    s.toSource();
    expect(s.display().notices).toEqual([]);
    s.enter();
    expect(s.display().notices).toEqual([{ kind: "image", message: "壊れた" }]);
    fail = false;
    s.change(big("b"));
    expect(s.display().notices).toEqual([{ kind: "image", message: "壊れた" }]);
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
