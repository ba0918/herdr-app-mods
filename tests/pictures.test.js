import { describe, expect, test } from "bun:test";
import { PictureNames, PictureTable, ReleaseQueue, parsePictureName, sweepTargets, ownStale, oldCacheNames, companionInstalled, tinyPicture, IMAGES_DIR } from "../mods/file-viewer/lib/pictures.js";
import { diagramLayout } from "../mods/file-viewer/lib/prepare.js";

// 仕様の「画像の置き場所」の確かめ方: 名前の決め方は単体テストで確かめる。
const TOKEN = "3f2b9c1e-8a7d-4e6f-9b0c-1d2e3f4a5b6c";

describe("絵のファイルの名前", () => {
  test("付き添いの mod のフォルダに置く", () => {
    expect(IMAGES_DIR).toBe("mods/file-viewer-images");
  });

  test("名前から token・窓の印・書いた時刻を読み戻せる（UUID の token、窓の印なし）", () => {
    const names = new PictureNames({ token: TOKEN, clock: () => 1_794_262_283_123 });
    const name = names.next("svg");
    expect(parsePictureName(name)).toEqual({ token: TOKEN, mark: null, time: 1_794_262_283_123, b64: false });
  });

  test("窓の印のある名前も、持ち主の token と印と時刻を読み戻せる", () => {
    const names = new PictureNames({ token: TOKEN, mark: "z1a2b3c", clock: () => 5_000 });
    expect(parsePictureName(names.next("svg"))).toEqual({ token: TOKEN, mark: "z1a2b3c", time: 5_000, b64: false });
  });

  test("画像のコピーの途中の .b64 も読み戻せ、.b64 と分かる", () => {
    const names = new PictureNames({ token: TOKEN, clock: () => 7_000 });
    expect(parsePictureName(`${names.next("png")}.b64`)).toEqual({ token: TOKEN, mark: null, time: 7_000, b64: true });
  });

  test("タイルも 1 枚ずつ別の名前になり、どれも読み戻せる", () => {
    const names = new PictureNames({ token: TOKEN, clock: () => 9_000 });
    const tiles = [names.next("svg"), names.next("svg"), names.next("svg")];
    expect(new Set(tiles).size).toBe(3);
    for (const t of tiles) expect(parsePictureName(t)?.token).toBe(TOKEN);
  });

  test("同じコピーで同じ時刻に続けて作った名前は重ならない", () => {
    const names = new PictureNames({ token: TOKEN, clock: () => 1_000 });
    const made = Array.from({ length: 50 }, () => names.next("svg"));
    expect(new Set(made).size).toBe(50);
  });

  test("同じ token の別のコピー（後に始まった）の名前とも重ならない", () => {
    const first = new PictureNames({ token: TOKEN, clock: () => 1_000 });
    const later = new PictureNames({ token: TOKEN, clock: () => 2_000 });
    const a = Array.from({ length: 5 }, () => first.next("svg"));
    const b = Array.from({ length: 5 }, () => later.next("svg"));
    expect(a.filter((n) => b.includes(n))).toEqual([]);
  });

  test("付き添いの mod のファイルと app が書くファイルは、絵のファイルの名前として読めない", () => {
    for (const name of ["main.js", "mod.json", "gpui-kit.d.ts", "jsconfig.json"]) expect(parsePictureName(name)).toBe(null);
  });

  test("前の置き場所の名前の形（<token>-<ハッシュ 12 桁>）は、絵のファイルの名前として読めない", () => {
    expect(parsePictureName(`${TOKEN}-0123456789ab.svg`)).toBe(null);
    expect(parsePictureName(`${TOKEN}~z1a-0123456789ab.png.b64`)).toBe(null);
  });
});

// 仕様の「画像の置き場所」の「名前と手放す時」。表は使っている絵の「見た目の鍵 → 名前」を持ち、描画で使う場所ごとの名前の集まりから、
// 使わなくなった絵を選ぶ。
describe("使っている絵の表", () => {
  function table() {
    let t = 1_000;
    return new PictureTable(new PictureNames({ token: TOKEN, clock: () => t++ }));
  }
  // 描画で使う名前を渡し、その描画が済んだことを知らせて、手放す名前を取る。
  function render(tb, uses, companion = true) {
    for (const [place, names] of Object.entries(uses)) tb.use(place, names);
    tb.drawn(tb.commit());
    return tb.takeReleases(companion);
  }
  const written = (tb, ...names) => { for (const n of names) { tb.writing(n); tb.wrote(n); } };

  test("同じ見た目の鍵は、持っている間は同じ名前を返す", () => {
    const tb = table();
    const a = tb.name("図A|色1", "svg");
    written(tb, a);
    expect(render(tb, { body: [a] })).toEqual([]);
    expect(tb.name("図A|色1", "svg")).toBe(a);
  });

  test("手放したあとは、同じ見た目の鍵でも新しい名前を返す", () => {
    const tb = table();
    const a = tb.name("図A|色1", "svg");
    written(tb, a);
    render(tb, { body: [a] });
    expect(render(tb, { body: [] })).toEqual([a]);
    const again = tb.name("図A|色1", "svg");
    expect(again).not.toBe(a);
  });

  test("無くなったと知らされたあとは、同じ見た目の鍵でも新しい名前を返し、前の名前は使わなくなったら手放す", () => {
    const tb = table();
    const a = tb.name("図A|色1", "svg");
    written(tb, a);
    render(tb, { body: [a] });
    tb.lost([a]);
    const b = tb.name("図A|色1", "svg");
    expect(b).not.toBe(a);
    written(tb, b);
    expect(render(tb, { body: [b] })).toEqual([a]);
  });

  test("鍵の無い名前（画像のコピー）は、いつも新しい名前になる", () => {
    const tb = table();
    expect(tb.name(null, "png")).not.toBe(tb.name(null, "png"));
  });

  test("2 か所が同じ名前を使っていると、片方が外れても手放す名前に入らず、両方が外れたら入る", () => {
    const tb = table();
    const a = tb.name("図A", "svg");
    written(tb, a);
    render(tb, { body: [a], lent: [a] });
    expect(render(tb, { body: [] })).toEqual([]);
    expect(render(tb, { lent: [] })).toEqual([a]);
  });

  test("書いている途中の名前は、書き終わるまで手放す名前に入らない", () => {
    const tb = table();
    const a = tb.name("図A", "svg");
    tb.writing(a);
    expect(render(tb, { body: [] })).toEqual([]);
    tb.wrote(a);
    expect(tb.takeReleases(true)).toEqual([a]);
  });

  test("使っている絵が減っても、差し替えた描画が済んだことを知らせるまでは手放す名前を返さない", () => {
    const tb = table();
    const a = tb.name("図A", "svg");
    written(tb, a);
    render(tb, { body: [a] });
    tb.use("body", []);
    const frame = tb.commit();
    expect(tb.takeReleases(true)).toEqual([]);
    tb.drawn(frame);
    expect(tb.takeReleases(true)).toEqual([a]);
  });

  test("描画のあとに作った名前は、その描画が済んだ知らせでは手放す名前に入らない", () => {
    const tb = table();
    const frame = tb.commit();
    const b = tb.name("図B", "svg");
    written(tb, b);
    tb.drawn(frame);
    expect(tb.takeReleases(true)).toEqual([]);
    expect(render(tb, { body: [b] })).toEqual([]);
  });

  test("まだ書いていない名前は、使わなくなっても手放す名前に入らず、表から外すだけになる", () => {
    const tb = table();
    const a = tb.name("図A", "svg");
    render(tb, { body: [a] });
    expect(render(tb, { body: [] })).toEqual([]);
    expect(tb.name("図A", "svg")).not.toBe(a);
  });

  test("付き添いの mod が無いときは、使わなくなった名前を手放す名前に入れず、表から外すだけになる", () => {
    const tb = table();
    const a = tb.name("図A", "svg");
    written(tb, a);
    render(tb, { body: [a] });
    expect(render(tb, { body: [] }, false)).toEqual([]);
    expect(tb.name("図A", "svg")).not.toBe(a);
    expect(tb.takeReleases(true)).toEqual([]);
  });

  test("手放さずに外した名前（拡大の窓に渡した絵）は、手放す名前に入らない", () => {
    const tb = table();
    const a = tb.name("窓の絵", "svg");
    written(tb, a);
    render(tb, { opening: [a] });
    tb.forget([a]);
    expect(render(tb, { opening: [] })).toEqual([]);
  });

  test("受け取った書いてある絵（拡大の窓が渡された絵）は、使わなくなったら手放す", () => {
    const tb = table();
    tb.adopt("渡された.svg", "窓の絵|1");
    expect(tb.name("窓の絵|1", "svg")).toBe("渡された.svg");
    render(tb, { window: ["渡された.svg"] });
    expect(render(tb, { window: [] })).toEqual(["渡された.svg"]);
  });
});

describe("手放してから消すまで", () => {
  test("待ちが要るとき、書き換えた名前は待ちを過ぎるまで消す名前に入らない", () => {
    const q = new ReleaseQueue(2_000);
    q.released(["a.svg", "b.png"], 10_000);
    expect(q.due(11_999)).toEqual([]);
    expect(q.due(12_000)).toEqual(["a.svg", "b.png"]);
    expect(q.due(13_000)).toEqual([]);
  });

  test("待ちが 0 なら、書き換えたらすぐ消す名前に入る", () => {
    const q = new ReleaseQueue(0);
    q.released(["a.svg"], 10_000);
    expect(q.due(10_000)).toEqual(["a.svg"]);
  });
});

describe("見張りが選ぶファイル", () => {
  const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const at = (token, time, ext = "svg", mark = null) => new PictureNames({ token, mark, clock: () => time }).next(ext);

  test("開いているタブの token のものは、古くても選ばない", () => {
    const names = [at(TOKEN, 1_000), at(TOKEN, 1_000, "svg", "z1"), `${at(TOKEN, 1_000, "png")}.b64`];
    expect(sweepTargets({ names, openTokens: new Set([TOKEN]), now: 100_000 })).toEqual({ release: [], remove: [] });
  });

  test("ほかの token のものは、名前の時刻から 10 秒以上たったものだけを選ぶ", () => {
    const old = at(OTHER, 50_000), fresh = at(OTHER, 50_001), win = at(OTHER, 40_000, "svg", "z9");
    expect(sweepTargets({ names: [old, fresh, win], openTokens: new Set([TOKEN]), now: 60_000 })).toEqual({ release: [old, win], remove: [] });
  });

  test(".b64 は絵ではないので、消すだけのものとして選ぶ", () => {
    const b64 = `${at(OTHER, 1_000, "png")}.b64`;
    expect(sweepTargets({ names: [b64], openTokens: new Set(), now: 60_000 })).toEqual({ release: [], remove: [b64] });
  });

  test("絵のファイルの名前の形でないもの（付き添いの mod のファイル、app が書くファイル）は選ばない", () => {
    const names = ["main.js", "mod.json", "gpui-kit.d.ts", "jsconfig.json", `${OTHER}-0123456789ab.svg`];
    expect(sweepTargets({ names, openTokens: new Set(), now: 1e13 })).toEqual({ release: [], remove: [] });
  });
});

describe("コピーの始めの回に自分で片付けるファイル", () => {
  const OTHER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const at = (token, time, ext = "svg", mark = null) => new PictureNames({ token, mark, clock: () => time }).next(ext);

  test("自分の token（窓の印の付いたものを含む）で、名前の時刻がコピーの始まりより前のものだけを選ぶ", () => {
    const before = at(TOKEN, 999), win = at(TOKEN, 500, "svg", "z1"), b64 = `${at(TOKEN, 998, "png")}.b64`;
    const mine = at(TOKEN, 1_000), other = at(OTHER, 10);
    expect(ownStale({ names: [before, win, b64, mine, other, "main.js"], token: TOKEN, startedAt: 1_000 })).toEqual({ release: [before, win], remove: [b64] });
  });
});

describe("前の置き場所で消すファイル", () => {
  test("前の名前の形（<token>[~<印>]-<ハッシュ 12 桁>、.b64 を含む）のものだけを選ぶ", () => {
    const old = [`${TOKEN}-0123456789ab.svg`, `${TOKEN}~z1a-abcdef012345.svg`, `${TOKEN}-0123456789ab.png.b64`];
    const others = ["notes.txt", new PictureNames({ token: TOKEN, clock: () => 1 }).next("svg"), "desktop.ini"];
    expect(oldCacheNames([...old, ...others])).toEqual(old);
  });
});

describe("付き添いの mod", () => {
  test("main.js と mod.json の両方があるときだけ入っている", () => {
    expect(companionInstalled({ main: true, mod: true })).toBe(true);
    expect(companionInstalled({ main: true, mod: false })).toBe(false);
    expect(companionInstalled({ main: false, mod: true })).toBe(false);
  });

  test("入っていないとき、書き出す前に決まる理由の無い図は「付き添いの mod が入っていない」", () => {
    expect(diagramLayout("flowchart LR\nA-->B", 3, { companion: false })).toEqual({ error: { kind: "companion", message: "付き添いの mod が入っていない" } });
  });

  test("入っていないときも、書き出す前に決まる理由（未対応の種類・未対応の書き方・文法エラー）のある図はその理由", () => {
    expect(diagramLayout("classDiagram\n  A <|-- B", 1, { companion: false }).error.message).toBe("未対応の種類: classDiagram");
    expect(diagramLayout("flowchart LR\nA-->B\nclick A href", 41, { companion: false }).error.message).toBe("未対応の書き方: click（43 行目）");
    expect(diagramLayout("flowchart LR\nA-->", 10, { companion: false }).error.kind).toBe("syntax");
  });

  test("入っているときは、今までどおり配置する", () => {
    expect(diagramLayout("flowchart LR\nA-->B", 1, { companion: true }).layout).toBeDefined();
  });
});

// 仕様の「手放す」: ごく小さい同じ形式の絵で書き換える。
describe("ごく小さい絵", () => {
  const head = (ext) => [...Buffer.from(tinyPicture(ext).base64, "base64").subarray(0, 12)];
  test("png・jpg（jpeg）・gif・bmp・ico・webp は、その形式の署名で始まる 1 × 1 の絵", () => {
    expect(head("png").slice(0, 8)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(head("jpg").slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect(head("jpeg").slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect(String.fromCharCode(...head("gif").slice(0, 6))).toBe("GIF89a");
    expect(String.fromCharCode(...head("bmp").slice(0, 2))).toBe("BM");
    expect(head("ico").slice(0, 4)).toEqual([0, 0, 1, 0]);
    const webp = head("webp");
    expect(String.fromCharCode(...webp.slice(0, 4)) + String.fromCharCode(...webp.slice(8, 12))).toBe("RIFFWEBP");
  });

  test("拡張子の大文字・小文字は問わない", () => {
    expect(tinyPicture("PNG")).toEqual(tinyPicture("png"));
  });

  test("SVG は 1 × 1 の <svg> の文字列", () => {
    expect(tinyPicture("svg").text).toMatch(/^<svg [^>]*width="1" height="1"[^>]*\/>$/);
  });
});
