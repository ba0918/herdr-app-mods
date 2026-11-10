import { describe, expect, test } from "bun:test";
import { ensureTable, claimInit, initPlan, initDone, bodyPlace, seatOf, isSeatName, takeReleases, rendered, scan, acquire, wrote } from "../mods/file-viewer/lib/seats.js";
import { SeatUser } from "../mods/file-viewer/lib/seat-user.js";

// コピー（タブか拡大の窓）が、絵の席の表を使う形（仕様の「画像の置き場所」の「絵の席の表」）。
const T1 = "3f2b9c1e-8a7d-4e6f-9b0c-1d2e3f4a5b6c";
const T2 = "8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
function ready(count = 4) {
  const table = ensureTable({}, 0);
  const owner = { place: bodyPlace(T1), gen: "g0" };
  claimInit(table, owner, 0);
  initPlan(table, [], count);
  initDone(table, owner);
  return table;
}
const user = (table, token = T1, gen = "g1") => new SeatUser(table, { place: bodyPlace(token), gen });

describe("鍵から絵の席の名前を取る", () => {
  test("空きの絵の席を割り当てたときだけ、自分が書く絵の席になる", () => {
    const table = ready();
    const a = user(table), b = user(table, T2);
    const name = a.nameOf("図A");
    expect(isSeatName(name)).toBe(true);
    expect(a.mustWrite(name)).toBe(true);
    expect(b.nameOf("図A")).toBe(name);
    expect(b.mustWrite(name)).toBe(false);
  });

  test("このコピーが新しく使い始めた名前を、そのたびに知らせる（持っている間は知らせない）", () => {
    const table = ready();
    const a = user(table), b = user(table, T2);
    const seen = [];
    const name = a.nameOf("図A", (n) => seen.push(`a:${n}`));
    a.nameOf("図A", (n) => seen.push(`a:${n}`));
    b.nameOf("図A", (n) => seen.push(`b:${n}`));
    expect(seen).toEqual([`a:${name}`, `b:${name}`]);
  });

  test("割り当てを待つ間は、絵の席の名前でない仮の名前を返し、待っているわけを覚える", () => {
    const table = ensureTable({}, 0);
    const a = user(table);
    const name = a.nameOf("図A");
    expect(isSeatName(name)).toBe(false);
    expect(a.blocked).toEqual({ wait: "init" });
  });
});

describe("使っている絵の席を渡す", () => {
  test("仮の名前は表に渡さない", () => {
    const table = ensureTable({}, 0);
    const a = user(table);
    a.use([a.nameOf("図A")]);
    expect(table.places[bodyPlace(T1)].names).toEqual([]);
  });

  test("書く印を受けたがもう使わない絵の席は、書かずに手放す絵の席にする", () => {
    const table = ready();
    const a = user(table);
    const name = a.nameOf("図A");
    a.use([]);
    expect(seatOf(table, name).key).toBe(null);
    rendered(table, bodyPlace(T1));
    expect(takeReleases(table, a.owner)).toEqual([name]);
  });

  test("書いている途中の絵の席は、使わなくなっても書き終わるまで印を残す", () => {
    const table = ready();
    const a = user(table);
    const name = a.nameOf("図A");
    a.writing(name);
    a.use([]);
    expect(seatOf(table, name).state).toBe("writing");
    a.wrote(name, { ok: true });
    expect(seatOf(table, name)).toMatchObject({ state: "ready", key: "図A" });
    expect(a.mustWrite(name)).toBe(false);
  });

  test("外した名前は、次に使い始めたときにまた知らせる", () => {
    const table = ready();
    const a = user(table), b = user(table, T2);
    const seen = [];
    const name = a.nameOf("図A");
    a.wrote(name, { ok: true });
    b.nameOf("図A", (n) => seen.push(n));
    b.use([]);
    b.nameOf("図A", (n) => seen.push(n));
    expect(seen).toEqual([name, name]);
  });
});

describe("書かずに止まるとき", () => {
  // 仕様: 同じ図は 1 つの絵の席を共有する。整形の準備は表示しているときだけ動かし、10 秒は表示している間だけ数える。
  // 表示しなくなって止まったコピーの書く印が残ると、表示している共有した側が書けないまま 10 秒を数える。
  test("書く印を受けて書き始めずに止まったら印を外し、同じ鍵を求めたほかのコピーが自分で書く", () => {
    const table = ready();
    const a = user(table), b = user(table, T2);
    const name = a.nameOf("図A");
    expect(b.nameOf("図A")).toBe(name);
    a.stop();
    expect(a.mustWrite(name)).toBe(false);
    const again = b.take("図A");
    expect(again.write).toBe(true);
    expect(b.mustWrite(again.name)).toBe(true);
  });

  test("書いている途中の絵の席は、止まっても書き終わるまで印を残す", () => {
    const table = ready();
    const a = user(table);
    const name = a.nameOf("図A");
    a.writing(name);
    a.stop();
    expect(seatOf(table, name).state).toBe("writing");
    a.wrote(name, { ok: true });
    expect(seatOf(table, name)).toMatchObject({ state: "ready", key: "図A" });
  });

  test("絵の席を増やす指示を受けて始めずに止まったら受け持ちを外し、ほかのコピーが増やせる", () => {
    const table = ready(1);
    const a = user(table), b = user(table, T2);
    const first = acquire(table, a.owner, "図A");
    wrote(table, first.name, a.owner, { ok: true });
    a.take("図B");
    expect(a.blocked.grow).toBeDefined();
    expect(b.take("図C").name).toBeUndefined();
    expect(b.blocked).toEqual({ wait: "grow" });
    a.stop();
    expect(a.blocked).toBe(null);
    b.blocked = null;
    b.take("図C");
    expect(b.blocked.grow).toBeDefined();
  });

  // 仕様: 絵の席が足りなくなったら、まとめて増やす（反例: 待つわけを先に覚えたコピーが、あとで受けた増やす指示を捨てると、
  // 増やす受け持ちが残ったまま誰も増やさず、その窓のどこも絵の席を取れない）。
  test("ほかのコピーが増やすのを待っている間に増やす指示を受けたら、待つわけより増やす指示を覚える", () => {
    const table = ready(1);
    const a = user(table), b = user(table, T2);
    const first = acquire(table, a.owner, "図A");
    wrote(table, first.name, a.owner, { ok: true });
    a.take("図B");
    b.take("図C");
    expect(b.blocked).toEqual({ wait: "grow" });
    a.stop();
    b.take("図C");
    expect(b.blocked.grow).toBeDefined();
  });

  // 仕様: 手放すのは出していない絵の席だけ（反例: 増やしている途中に受けた同じ増やす指示でもう一度作ると、その書き込みが、先に
  // 作り終えて絵を書いた絵の席をごく小さい絵で上書きしうる）。
  test("増やしている途中にもう一度増やす指示を受けても同じ絵の席を二度作らず、止まっても増やす受け持ちを外さない", async () => {
    const table = ready(1);
    const a = user(table), b = user(table, T2);
    const first = acquire(table, a.owner, "図A");
    wrote(table, first.name, a.owner, { ok: true });
    a.take("図B");
    const names = a.blocked.grow;
    a.blocked = null;
    const writes = [];
    let finish;
    const gate = new Promise((resolve) => { finish = resolve; });
    const write = async (list) => { writes.push(list); await gate; return []; };
    const growing = a.grow(names, write);
    a.take("図C");
    expect(a.blocked).toEqual({ grow: names });
    a.stop();
    expect(b.take("図D")).toEqual({ wait: "grow" });
    const again = a.grow(names, write);
    finish();
    await growing;
    await again;
    expect(writes).toEqual([names]);
    expect(b.take("図D").write).toBe(true);
  });

  // 仕様: 手放すのは出していない絵の席だけ（反例: 増やしている途中の描画で受けた同じ増やす指示が増やし終えたあとも残り、それで
  // もう一度作ると、増やした絵の席にほかのコピーが書いて出している絵をごく小さい絵で上書きする）。
  test("増やしている途中に受けた増やす指示は、増やし終えたあとに残っても、増やした絵の席をもう一度作らない", async () => {
    const table = ready(1);
    const a = user(table), b = user(table, T2);
    const first = acquire(table, a.owner, "図A");
    wrote(table, first.name, a.owner, { ok: true });
    a.take("図B");
    const names = a.blocked.grow;
    a.blocked = null;
    const writes = [];
    let finish;
    const gate = new Promise((resolve) => { finish = resolve; });
    const write = async (list) => { writes.push(list); await gate; return []; };
    const growing = a.grow(names, write);
    a.take("図C");
    finish();
    await growing;
    expect(a.blocked).toBe(null);
    const shown = b.take("図D");
    b.wrote(shown.name, { ok: true });
    const blocked = a.blocked;
    a.blocked = null;
    if (blocked?.grow) await a.grow(blocked.grow, write);
    expect(writes).toEqual([names]);
    expect(seatOf(table, shown.name)).toMatchObject({ state: "ready", key: "図D" });
  });
});

describe("画像のコピーの絵の席を取る", () => {
  test("割り当ての結果をそのまま返し、空きを割り当てたときだけ自分が書く絵の席になる", () => {
    const table = ready();
    const a = user(table), b = user(table, T2);
    const r = a.take("画像A");
    expect(r).toMatchObject({ write: true });
    expect(a.mustWrite(r.name)).toBe(true);
    a.wrote(r.name, { ok: true, info: { size: 3 } });
    expect(b.take("画像A")).toMatchObject({ name: r.name, write: false, writing: false, info: { size: 3 } });
    expect(b.mustWrite(r.name)).toBe(false);
  });

  test("割り当てを待つ間は名前を返さず、待っているわけを覚える", () => {
    const a = user(ensureTable({}, 0));
    expect(a.take("画像A").name).toBeUndefined();
    expect(a.blocked).toEqual({ wait: "init" });
  });
});

describe("無くなった絵の席を書き直す", () => {
  test("このコピーの使う場所にある無くなった絵の席を受け持つと、自分が書く絵の席になり、ほかのコピーは受け持てない", () => {
    const table = ready(2);
    const a = user(table), b = user(table, T2);
    const name = a.nameOf("図A");
    a.wrote(name, { ok: true });
    b.nameOf("図A");
    scan(table, [], a.owner);
    expect(a.lostSeats()).toEqual([name]);
    expect(a.claim(name)).toBe(true);
    expect(a.mustWrite(name)).toBe(true);
    expect(b.claim(name)).toBe(false);
    a.wrote(name, { ok: true });
    expect(seatOf(table, name)).toMatchObject({ state: "ready", key: "図A" });
    expect(a.lostSeats()).toEqual([]);
  });
});

