import { describe, expect, test } from "bun:test";
import {
  SEATS_VERSION, INITIAL_SEATS, GROW_SEATS, STALE_GEN_MS, IMAGES_DIR, seatName, isSeatName,
  ensureTable, claimInit, initPlan, initDone, acquire, grown, wrote, use, rendered, dropPlace, takeReleases, released,
  startGen, watch, scan, rewrites, claimRewrite, imageKey, bodyPlace, windowPlace, seatOf,
} from "../mods/file-viewer/lib/seats.js";
import { RENDER_LIMIT } from "../mods/file-viewer/lib/render-size.js";

// 仕様の「画像の置き場所」の確かめ方: 絵の席の表（使い始める・共有して数える・手放す絵の席を選ぶ・本文と窓で分けて引き継ぐ・
// 初めて作るときに手放す・見張りが外す・消えた絵の席を作り直す）は単体テストで確かめる。
const T1 = "3f2b9c1e-8a7d-4e6f-9b0c-1d2e3f4a5b6c";
const T2 = "8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const body1 = bodyPlace(T1), win1 = windowPlace(T1), body2 = bodyPlace(T2);

// 初めて作るときの手放しを済ませた、count 個の絵の席の表。
function ready(count = 4) {
  const holder = {};
  const table = ensureTable(holder, 0);
  const owner = { place: body1, gen: "g0" };
  claimInit(table, owner, 0);
  const plan = initPlan(table, [], count);
  initDone(table, owner);
  return { table, plan };
}
const own = (place, gen = "g1") => ({ place, gen });
// 書く印を受けたら書き終える。
function take(table, owner, key, info) {
  const r = acquire(table, owner, key);
  if (r.write) wrote(table, r.name, owner, { ok: true, info });
  return r;
}

describe("絵の席の名前", () => {
  test("絵の席は mods/file-viewer-images/ の、番号の入った決まった名前のファイル", () => {
    expect(IMAGES_DIR).toBe("mods/file-viewer-images");
    expect(isSeatName(seatName(0))).toBe(true);
    expect(isSeatName(seatName(1234))).toBe(true);
    expect(seatName(1)).not.toBe(seatName(2));
  });

  test("app が書くファイル、前の作りの名前、. で始まる名前と ~ で終わる名前は、絵の席として拾わない", () => {
    for (const name of ["gpui-kit.d.ts", "jsconfig.json", "main.js", "mod.json", `${T1}-0mh0abcde-0.svg`, `${T1}-0123456789ab.png`, `.${seatName(1)}`, `${seatName(1)}~`]) {
      expect(isSeatName(name)).toBe(false);
    }
    expect(seatName(3).startsWith(".")).toBe(false);
    expect(seatName(3).endsWith("~")).toBe(false);
  });
});

describe("使い始める", () => {
  test("同じ鍵を 2 つの使う場所が求めると同じ絵の席になり、書く印は 1 回だけ返る", () => {
    const { table } = ready();
    const a = acquire(table, own(body1), "図A");
    const b = acquire(table, own(body2), "図A");
    expect(b.name).toBe(a.name);
    expect(a.write).toBe(true);
    expect(b.write).toBe(false);
  });

  test("違う鍵は、使っていない別の絵の席になる", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    const b = take(table, own(body1), "図B");
    expect(b.name).not.toBe(a.name);
    expect(b.write).toBe(true);
  });

  test("使っていない絵の席が無いときは、増やす数の絵の席を作る指示を返し、作ったあとに割り当てる", () => {
    const { table } = ready(2);
    take(table, own(body1), "図A");
    take(table, own(body1), "図B");
    const r = acquire(table, own(body1), "図C");
    expect(r.name).toBeUndefined();
    expect(r.grow.length).toBe(GROW_SEATS);
    expect(r.grow).toEqual(Array.from({ length: GROW_SEATS }, (_, i) => seatName(2 + i)));
    // 作っている間は、ほかのコピーは待つ。
    expect(acquire(table, own(body2), "図D").wait).toBe("grow");
    grown(table, r.grow, own(body1));
    const again = acquire(table, own(body1), "図C");
    expect(r.grow).toContain(again.name);
    expect(again.write).toBe(true);
  });
});

describe("共有して数える", () => {
  test("同じタブの本文と窓が共有する絵の席は、片方が外しても手放さず、両方が外して描画が進むと手放す", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    take(table, own(win1), "図A");
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, own(body1))).toEqual([]);
    use(table, win1, []);
    rendered(table, win1);
    expect(takeReleases(table, own(body1))).toEqual([a.name]);
  });

  test("別のタブの本文どうしが共有する絵の席も、両方が外すまで手放さない", () => {
    const { table } = ready();
    const a = take(table, own(body1), "画像A");
    take(table, own(body2), "画像A");
    use(table, body2, []);
    rendered(table, body2);
    expect(takeReleases(table, own(body2))).toEqual([]);
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, own(body1))).toEqual([a.name]);
  });
});

describe("描画の回数", () => {
  test("外した使う場所の描画が、外したときより進むまで手放さない", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    rendered(table, body1);
    use(table, body1, []);
    expect(takeReleases(table, own(body1))).toEqual([]);
    rendered(table, body1);
    expect(takeReleases(table, own(body1))).toEqual([a.name]);
  });

  test("その使う場所を表から外すと、描画の回数を待たずに手放す", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    use(table, body1, []);
    dropPlace(table, body1);
    expect(takeReleases(table, own(body2))).toEqual([a.name]);
  });

  test("手放す前に同じ鍵がまた求められると、手放さずに同じ絵の席を返す", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    use(table, body1, []);
    rendered(table, body1);
    const again = acquire(table, own(body1), "図A");
    expect(again).toMatchObject({ name: a.name, write: false });
    expect(takeReleases(table, own(body1))).toEqual([]);
  });

  test("手放し始めた絵の席は、上書きが終わるまで共有にも新しい割り当てにも返らず、終われば空きに戻る", () => {
    const { table } = ready(1);
    const a = take(table, own(body1), "図A");
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, own(body1))).toEqual([a.name]);
    const during = acquire(table, own(body2), "図A");
    expect(during.name).toBeUndefined();
    expect(during.grow).toBeDefined();
    grown(table, during.grow, own(body2));
    released(table, [a.name], own(body1));
    expect(seatOf(table, a.name).state).toBe("free");
  });

  test("書いたことのある絵の席を、どこも使わなくなれば手放す（書き出しの失敗で中身が分からないものも）", () => {
    const { table } = ready();
    const owner = own(body1);
    const r = acquire(table, owner, "図A");
    wrote(table, r.name, owner, { ok: false });
    expect(seatOf(table, r.name).key).toBe(null);
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, owner)).toEqual([r.name]);
  });
});

describe("ごく小さい絵で上書きできなかったとき", () => {
  // 仕様: 使っていない絵の席は、ごく小さい絵のファイルとして残る。手放した絵の席は、次の絵に使い直す。
  test("手放すときに上書きできなかった絵の席は空きに戻さず、次の手放しでもう一度上書きする", () => {
    const { table } = ready(2);
    const a = take(table, own(body1), "図A");
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, own(body1))).toEqual([a.name]);
    released(table, [a.name], own(body1), [a.name]);
    expect(acquire(table, own(body2), "図B").name).not.toBe(a.name);
    expect(takeReleases(table, own(body2))).toEqual([a.name]);
  });

  test("初めて作るときに上書きできなかった絵の席は空きにせず、そのあとの手放しでもう一度上書きする", () => {
    const table = ensureTable({}, 0);
    const owner = own(body1);
    claimInit(table, owner, 0);
    initPlan(table, [seatName(0), seatName(1)], 2);
    initDone(table, owner, [seatName(0)]);
    expect(acquire(table, own(body2), "図A").name).toBe(seatName(1));
    expect(takeReleases(table, own(body2))).toEqual([seatName(0)]);
  });

  test("増やすときに作れなかった絵の席は空きにせず、そのあとの手放しでもう一度作る", () => {
    const { table } = ready(1);
    take(table, own(body1), "図A");
    const r = acquire(table, own(body1), "図B");
    grown(table, r.grow, own(body1), [r.grow[0]]);
    expect(acquire(table, own(body1), "図B").name).toBe(r.grow[1]);
    expect(takeReleases(table, own(body2))).toEqual([r.grow[0]]);
  });

  test("作れなかった絵の席をもう一度作るまでは、空きが無くてもさらに増やさずに待ち、作れたらそれを割り当てる", () => {
    const { table } = ready(1);
    take(table, own(body1), "図A");
    const r = acquire(table, own(body1), "図B");
    grown(table, r.grow, own(body1), r.grow);
    expect(acquire(table, own(body1), "図B")).toEqual({ wait: "release" });
    const again = takeReleases(table, own(body1));
    expect(again).toEqual(r.grow);
    released(table, again, own(body1));
    expect(acquire(table, own(body1), "図B")).toMatchObject({ name: r.grow[0], write: true });
  });
});

describe("書いている途中と世代", () => {
  test("書き終わるまで手放さず、同じ鍵を求めた別の使う場所には「書いている途中」が返る", () => {
    const { table } = ready();
    const owner = own(body1);
    const r = acquire(table, owner, "図A");
    expect(acquire(table, own(body2), "図A")).toMatchObject({ name: r.name, write: false, writing: true });
    use(table, body1, []);
    use(table, body2, []);
    rendered(table, body1);
    rendered(table, body2);
    expect(takeReleases(table, owner)).toEqual([]);
    wrote(table, r.name, owner, { ok: true });
    expect(takeReleases(table, owner)).toEqual([r.name]);
  });

  test("同じ使う場所の新しい世代が始まると、前の世代の書いている途中の絵の席は鍵を外され、どこにも無ければ手放す", () => {
    const { table } = ready();
    const old = own(body1, "g1");
    const r = acquire(table, old, "図A");
    use(table, body1, []);
    rendered(table, body1);
    startGen(table, own(body1, "g2"), 0);
    expect(seatOf(table, r.name).key).toBe(null);
    expect(takeReleases(table, own(body1, "g2"))).toEqual([r.name]);
    // その鍵は、別の絵の席に書き直す。
    const again = acquire(table, own(body1, "g2"), "図A");
    expect(again.name).not.toBe(r.name);
    expect(again.write).toBe(true);
  });

  test("前の世代の手放し中の絵の席は、手放し直す", () => {
    const { table } = ready();
    const old = own(body1, "g1");
    const a = take(table, old, "図A");
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, old)).toEqual([a.name]);
    startGen(table, own(body1, "g2"), 0);
    expect(takeReleases(table, own(body1, "g2"))).toEqual([a.name]);
  });

  test("窓の使う場所の新しい世代は、本文の使う場所の印を外さない", () => {
    const { table } = ready();
    const r = acquire(table, own(body1, "g1"), "図A");
    startGen(table, own(win1, "g2"), 0);
    expect(seatOf(table, r.name)).toMatchObject({ key: "図A", state: "writing" });
  });
});

describe("窓の置き換え", () => {
  test("窓の使う場所を外して作り直すと、前の集まりの絵の席は描画の回数を待たずに手放し、新しい窓が集まりに入れた絵の席は手放さない", () => {
    const { table } = ready();
    const a = take(table, own(win1), "図A|s1");
    const b = take(table, own(win1), "図A|s2");
    dropPlace(table, win1);
    take(table, own(win1, "g2"), "図A|s2");
    expect(takeReleases(table, own(body1))).toEqual([a.name]);
    expect(seatOf(table, b.name).state).toBe("ready");
  });
});

describe("閉じた窓のコピーが外す使う場所", () => {
  test("使う場所を外すのは、その使う場所の今の世代のコピーだけ（新しい窓に替わったあとで閉じた前の窓は、新しい窓の集まりを外さない）", () => {
    const { table } = ready();
    const old = own(win1, "g1"), next = own(win1, "g2");
    startGen(table, old, 0);
    dropPlace(table, win1);
    const a = take(table, next, "図A");
    startGen(table, next, 0);
    dropPlace(table, win1, old);
    expect(table.places[win1].names).toEqual([a.name]);
    dropPlace(table, win1, next);
    expect(table.places[win1]).toBeUndefined();
  });
});

describe("初めて作るとき", () => {
  test("フォルダの一覧から絵の席の名前だけを拾って全部を手放す絵の席にし、初めの数に足りない分を作る", () => {
    const table = ensureTable({}, 0);
    const owner = own(body1);
    expect(claimInit(table, owner, 0)).toBe(true);
    const listing = [seatName(0), seatName(2), "gpui-kit.d.ts", "jsconfig.json", `${T1}-0mh0abcde-0.svg`];
    const plan = initPlan(table, listing, 4);
    expect(plan.mkdir).toBe(false);
    expect(plan.overwrite).toEqual([seatName(0), seatName(2)]);
    expect(plan.create).toEqual([seatName(1), seatName(3)]);
  });

  test("フォルダが無ければ作り、初めの数の絵の席を作る", () => {
    const table = ensureTable({}, 0);
    claimInit(table, own(body1), 0);
    const plan = initPlan(table, null, 3);
    expect(plan).toEqual({ mkdir: true, overwrite: [], create: [seatName(0), seatName(1), seatName(2)] });
  });

  test("初めの数より多く増やしてあった絵の席も拾う", () => {
    const table = ensureTable({}, 0);
    claimInit(table, own(body1), 0);
    const plan = initPlan(table, [seatName(0), seatName(5)], 2);
    expect(plan.overwrite).toEqual([seatName(0), seatName(5)]);
    expect(plan.create).toEqual([seatName(1), seatName(2), seatName(3), seatName(4)]);
  });

  test("手放し中の間は割り当てが待たされ、終われば割り当てる", () => {
    const table = ensureTable({}, 0);
    const owner = own(body1);
    expect(acquire(table, own(body2), "図A").wait).toBe("init");
    claimInit(table, owner, 0);
    expect(claimInit(table, own(body2), 0)).toBe(false);
    initPlan(table, [], 2);
    expect(acquire(table, own(body2), "図A").wait).toBe("init");
    initDone(table, owner);
    expect(acquire(table, own(body2), "図A").write).toBe(true);
  });

  test("表は窓の globalThis に置く形（holder の決まった名前）で、版を持ち、2 つ目からは同じ表を返す", () => {
    const holder = {};
    const a = ensureTable(holder, 0);
    expect(a.version).toBe(SEATS_VERSION);
    expect(ensureTable(holder, 5)).toBe(a);
    expect(Object.values(holder)).toEqual([a]);
  });

  test("手放しを始めたコピーの世代が止まったら、ほかのコピーがやり直せる", () => {
    const table = ensureTable({}, 0);
    claimInit(table, own(body1, "g1"), 0);
    startGen(table, own(body1, "g2"), 0);
    expect(claimInit(table, own(body1, "g2"), 0)).toBe(true);
  });
});

describe("引き継ぐ", () => {
  test("同じ使う場所の新しい世代が最初に集まりを渡すまで、前の集まりの絵の席は手放さない", () => {
    const { table } = ready();
    const a = take(table, own(body1, "g1"), "図A");
    startGen(table, own(body1, "g2"), 0);
    rendered(table, body1);
    rendered(table, body1);
    expect(takeReleases(table, own(body1, "g2"))).toEqual([]);
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, own(body1, "g2"))).toEqual([a.name]);
  });
});

describe("見張り", () => {
  test("開いているタブの印でない使う場所を外し、その絵の席を手放す。開いているタブの使う場所は表示していなくても外さない", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    const b = take(table, own(body2), "図B");
    const w = take(table, own(win1), "図C");
    watch(table, new Set([T2]), 0);
    expect(takeReleases(table, own(body2)).sort()).toEqual([a.name, w.name].sort());
    expect(seatOf(table, b.name).state).toBe("ready");
  });

  test("ほかの使う場所が外して描画を待っている絵の席は、その描画を待つ", () => {
    const { table } = ready();
    const a = take(table, own(body1), "図A");
    take(table, own(body2), "図A");
    use(table, body2, []);
    watch(table, new Set([T2]), 0);
    expect(takeReleases(table, own(body2))).toEqual([]);
    rendered(table, body2);
    expect(takeReleases(table, own(body2))).toEqual([a.name]);
  });

  test("最後の回から 10 秒たった世代の書いている途中・手放し中の印は、止まった世代と同じに扱う", () => {
    const { table } = ready();
    const g1 = own(body1, "g1");
    startGen(table, g1, 0);
    const w = acquire(table, g1, "図A");
    const r = take(table, g1, "図B");
    use(table, body1, []);
    rendered(table, body1);
    expect(takeReleases(table, g1)).toEqual([r.name]);
    watch(table, new Set([T1]), STALE_GEN_MS - 1);
    expect(seatOf(table, w.name).state).toBe("writing");
    watch(table, new Set([T1]), STALE_GEN_MS + 1);
    expect(seatOf(table, w.name).key).toBe(null);
    expect(takeReleases(table, own(body2)).sort()).toEqual([w.name, r.name].sort());
  });
});

describe("消えた絵の席", () => {
  test("一覧に無い絵の席のうち、どこの集まりにも無いものはごく小さい絵で作り、集まりにあるものは無くなったにして、その使う場所に書き直させる", () => {
    const { table } = ready(3);
    const a = take(table, own(body1), "図A");
    const others = [seatName(0), seatName(1), seatName(2)].filter((n) => n !== a.name);
    const first = scan(table, [a.name, others[1]], own(body2));
    expect(first).toEqual({ mkdir: false, create: [others[0]] });
    expect(seatOf(table, a.name).state).toBe("ready");
    released(table, first.create, own(body2));
    const second = scan(table, others, own(body2));
    expect(second).toEqual({ mkdir: false, create: [] });
    expect(seatOf(table, a.name).state).toBe("lost");
    expect(rewrites(table, body1)).toEqual([a.name]);
    expect(rewrites(table, body2)).toEqual([]);
  });

  test("共有している絵の席は、先に気づいたコピーが書き、もう一方は書き終わるのを待つ", () => {
    const { table } = ready(2);
    const a = take(table, own(body1), "図A");
    take(table, own(body2), "図A");
    scan(table, [], own(body1));
    expect(claimRewrite(table, a.name, own(body2))).toBe(true);
    expect(claimRewrite(table, a.name, own(body1))).toBe(false);
    expect(acquire(table, own(body1), "図A")).toMatchObject({ name: a.name, writing: true });
    wrote(table, a.name, own(body2), { ok: true });
    expect(seatOf(table, a.name)).toMatchObject({ key: "図A", state: "ready" });
    expect(rewrites(table, body1)).toEqual([]);
  });

  // 仕様: 消えた絵の席を使っていたタブと拡大の窓は、出していた絵をその絵の席に書き直す。どこも使っていなかった絵の席は、ごく小さい絵で作る。
  test("集まりにある絵の席は、中身の分からないものも、一覧に無いときに作り直して空きにせず、その使う場所に書き直させる", () => {
    const { table } = ready(2);
    const owner = own(body1);
    const r = acquire(table, owner, "図A");
    wrote(table, r.name, owner, { ok: false });
    const other = [seatName(0), seatName(1)].find((n) => n !== r.name);
    const s = scan(table, [other], own(body2));
    expect(s.create).toEqual([]);
    expect(rewrites(table, body1)).toEqual([r.name]);
    expect(takeReleases(table, own(body2))).toEqual([]);
    expect(acquire(table, own(body2), "図B").name).not.toBe(r.name);
  });

  test("書き直す前に使う場所がどこも使わなくなった絵の席は、次の確かめでごく小さい絵で作り、鍵を外して空きに戻す", () => {
    const { table } = ready(2);
    const a = take(table, own(body1), "図A");
    const other = [seatName(0), seatName(1)].find((n) => n !== a.name);
    scan(table, [other], own(body2));
    expect(rewrites(table, body1)).toEqual([a.name]);
    dropPlace(table, body1);
    const s = scan(table, [other], own(body2));
    expect(s.create).toEqual([a.name]);
    released(table, s.create, own(body2));
    expect(acquire(table, own(body1), "図A").write).toBe(true);
  });

  test("書き直しを受け持ったコピーが書けなかったか止まったら、その絵の席は無くなったまま残り、使う場所が書き直し直す", () => {
    const { table } = ready(2);
    const a = take(table, own(body1, "g1"), "図A");
    scan(table, [], own(body2));
    expect(claimRewrite(table, a.name, own(body1, "g1"))).toBe(true);
    wrote(table, a.name, own(body1, "g1"), { ok: false });
    expect(rewrites(table, body1)).toEqual([a.name]);
    expect(acquire(table, own(body2), "図A").name).toBe(a.name);
    expect(claimRewrite(table, a.name, own(body1, "g1"))).toBe(true);
    startGen(table, own(body1, "g2"), 0);
    expect(rewrites(table, body1)).toEqual([a.name]);
    expect(takeReleases(table, own(body1, "g2"))).toEqual([]);
  });

  test("フォルダが無いときは、フォルダを作る指示と、作る絵の席を返す", () => {
    const { table } = ready(2);
    const a = take(table, own(body1), "図A");
    const r = scan(table, null, own(body1));
    expect(r.mkdir).toBe(true);
    expect(r.create).toEqual([seatName(0), seatName(1)].filter((n) => n !== a.name));
    expect(rewrites(table, body1)).toEqual([a.name]);
  });

  test("作り直した絵の席は、作り終えると空きに戻る", () => {
    const { table } = ready(2);
    const r = scan(table, [], own(body1));
    expect(r.create.map((n) => seatOf(table, n).state)).toEqual(["releasing", "releasing"]);
    released(table, r.create, own(body1));
    expect(acquire(table, own(body2), "図B").write).toBe(true);
  });
});

describe("初めの数で足りること", () => {
  test("図の数が上限ちょうどの本文でテーマを替え、窓で 1 つの図を開いて倍率を 1 回替える間、増やす指示が一度も返らない", () => {
    const { table } = ready(INITIAL_SEATS);
    const n = RENDER_LIMIT.diagrams;
    const owner = own(body1);
    const keys = (theme) => Array.from({ length: n }, (_, i) => `図${i}|${theme}`);
    const grows = [];
    const get = (o, k) => { const r = take(table, o, k); if (r.grow) grows.push(k); return r; };
    const a = keys("A").map((k) => get(owner, k).name);
    use(table, body1, a);
    rendered(table, body1);
    const b = keys("B").map((k) => get(owner, k).name);
    use(table, body1, b);
    rendered(table, body1);
    const out = takeReleases(table, owner);
    expect(out.length).toBe(n);
    released(table, out, owner);
    const w = own(win1);
    const fit = get(w, "図0|B|fit").name;
    use(table, win1, [fit]);
    rendered(table, win1);
    const scaled = get(w, "図0|B|s2").name;
    use(table, win1, [scaled]);
    rendered(table, win1);
    expect(grows).toEqual([]);
  });
});

describe("画像の鍵", () => {
  const base = { machine: "wsl", path: "/repo/a.png", size: 100, mtime: 5 };
  test("machine・パス・大きさ・更新時刻のどれかが違うと違う鍵になる", () => {
    for (const change of [{ machine: null }, { path: "/repo/b.png" }, { size: 101 }, { mtime: 6 }]) {
      expect(imageKey({ ...base, ...change })).not.toBe(imageKey(base));
    }
  });

  test("同じなら共有され、載せた中身の情報が共有した側に返る", () => {
    const { table } = ready();
    const info = { hash: "abc", size: 100, header: [1, 2, 3] };
    const a = take(table, own(body1), imageKey(base), info);
    const b = acquire(table, own(body2), imageKey({ ...base }));
    expect(b).toMatchObject({ name: a.name, write: false, info });
  });
});
