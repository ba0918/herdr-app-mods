import { describe, expect, test } from "bun:test";
import { ensureTable, claimInit, initPlan, initDone, bodyPlace, seatOf, isSeatName, takeReleases, rendered } from "../mods/file-viewer/lib/seats.js";
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
