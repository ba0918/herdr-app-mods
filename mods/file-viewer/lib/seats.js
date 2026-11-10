// 絵の席の表（仕様の「画像の置き場所」の「置き場所と絵の席」「絵の席の表」「手放す時」「片付け」）。
// 絵（画像のコピーと図の SVG）は mods/file-viewer-images/ に前もって作った決まった名前のファイル（絵の席）に上書きで書き、使わなくなった
// 絵の席はごく小さい絵で上書きして手放す。どの絵の席をどこが使っているかは、窓の globalThis に置いた 1 つの表で覚える（モジュールは
// 同じ mod のコピーで分かれることがあるので、モジュールの変数には置かない）。表はふつうのデータ（オブジェクト・配列・数・文字列）だけで
// 作り、ここの関数が表を引数に取って読み書きする。ファイルの読み書きは main.js と io.js がする。
//
// 使う場所（place）は、タブの印と、本文か拡大の窓か（bodyPlace / windowPlace）。コピー（owner）は { place, gen } で、gen はコピーの
// init ごとに変わる値（hot reload のあとの新しいコピーを、止まった前のコピーと見分ける）。
import { RENDER_LIMIT } from "./render-size.js";

export const IMAGES_DIR = "mods/file-viewer-images";
// 表の形式の版。形を変えるときは、前の版から写す処理を同じ変更に足す（作り直すと、出している絵の席の持ち主が分からなくなる）。
export const SEATS_VERSION = 1;
const HOLDER_KEY = "__fileViewerSeatTable";
// 初めに作る絵の席の数: 上限ちょうどの図の文書でテーマを替える間は前と新しい色の絵の席を両方使うので図の数の 2 倍。そのあと拡大の窓の
// 2 つ（開いた絵と倍率を替えた絵）を使う。8 は差し替えが重なるときのゆとり。
export const INITIAL_SEATS = RENDER_LIMIT.diagrams * 2 + 8;
export const GROW_SEATS = 64;
// 最後の見張りの回からこれだけたった世代は止まったものとして、その書いている途中・手放し中の印を扱う。
export const STALE_GEN_MS = 10_000;
// 手放すときに書くごく小さい絵（1 × 1 の空の SVG）。形式は中身で決まるので、どの形式の絵の席にもこれを書く。
export const TINY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

const SEAT_DIGITS = 5;
const SEAT_NAME = new RegExp(`^seat-(\\d{${SEAT_DIGITS},})\\.img$`);

export function seatName(index) {
  return `seat-${String(index).padStart(SEAT_DIGITS, "0")}.img`;
}

export function isSeatName(name) {
  return SEAT_NAME.test(name);
}

function seatIndex(name) {
  return Number(SEAT_NAME.exec(name)[1]);
}

export const bodyPlace = (token) => `b:${token}`;
export const windowPlace = (token) => `w:${token}`;
const tokenOf = (place) => place.slice(2);

// 画像のコピーの鍵（machine・パス・大きさ・更新時刻）。図の鍵（lib/diagram-files.js）と混ざらないよう、先頭に NUL を入れる。
export function imageKey({ machine, path, size, mtime }) {
  return `\u0000image\n${machine ?? ""}\n${path}\n${size}\n${mtime}`;
}

// holder（窓の globalThis）の表。無いか版が違えば新しい表を作る。版の違う表から作り直したときは、出している前の絵の席を上書きしない
// よう、poll（見張りの間隔）たつまで初めての手放しを始めない。
export function ensureTable(holder, now, { poll = 0 } = {}) {
  const found = holder[HOLDER_KEY];
  if (found && found.version === SEATS_VERSION) return found;
  const table = {
    version: SEATS_VERSION,
    init: { state: "pending", notBefore: found ? now + poll : 0, by: null },
    growing: null,
    order: [],   // 絵の席の名前を番号の順に
    seats: {},
    keys: {},
    places: {},
    gens: {},
    chores: {},
  };
  holder[HOLDER_KEY] = table;
  return table;
}

// 状態: free（ごく小さい絵）、writing（owner が鍵の絵を書いている途中）、ready（鍵の絵がある）、releasing（owner がごく小さい絵で
// 上書きしている途中。by が無ければ、ごく小さい絵で上書きできなかったので、次の手放しでもう一度上書きする）、dirty（中身が分からない。使わなくなったら手放す）、lost（ファイルが無くなった。使う場所が書き直す。
// 書いたことのない中身の分からない絵の席なら鍵は無い）。rewrite: writing のうち、無くなった絵の席の書き直し（書けなければ lost に戻る）。
const seat = (state) => ({ state, key: null, by: null, info: null, rewrite: false });

export function seatOf(table, name) {
  return table.seats[name];
}

const same = (a, b) => Boolean(a && b) && a.place === b.place && a.gen === b.gen;

// 初めての手放しを owner が受け持てたら true（まだ誰も受け持っていない、始めてよい時刻になった表で）。
export function claimInit(table, owner, now) {
  const init = table.init;
  if (init.state !== "pending" || init.by || now < init.notBefore) return false;
  init.by = { ...owner };
  return true;
}

// 初めての手放しの段取り。listing: フォルダの一覧（無ければ null）。絵の席の名前だけを拾い、見つかったものは上書きし（overwrite）、
// count に足りない番号と抜けている番号は作る（create）。絵の席の名前の形でないファイルには触らない。
export function initPlan(table, listing, count = INITIAL_SEATS) {
  const found = (listing ?? []).filter(isSeatName).sort((a, b) => seatIndex(a) - seatIndex(b));
  const total = Math.max(count, ...found.map((n) => seatIndex(n) + 1));
  const have = new Set(found);
  const create = [];
  table.order = [];
  for (let i = 0; i < total; i++) {
    const name = seatName(i);
    table.order.push(name);
    table.seats[name] = seat("releasing");
    if (!have.has(name)) create.push(name);
  }
  return { mkdir: listing === null, overwrite: found, create };
}

// owner が初めての手放しを終えた。failed: ごく小さい絵で上書きできなかった絵の席（空きにせず、次の手放しでもう一度上書きする）。
export function initDone(table, owner, failed = []) {
  if (!same(table.init.by, owner)) return;
  const retry = new Set(failed);
  for (const [name, s] of Object.entries(table.seats)) if (s.state === "releasing" && !s.by && !retry.has(name)) s.state = "free";
  table.init = { state: "done", notBefore: 0, by: null };
}

function placeOf(table, place) {
  return (table.places[place] ??= { names: [], frame: 0, dropped: {}, shown: null });
}

// どこかの使う場所の集まりにある絵の席の名前。
function usedNames(table) {
  const used = new Set();
  for (const p of Object.values(table.places)) for (const name of p.names) used.add(name);
  return used;
}

function addName(table, place, name) {
  const p = placeOf(table, place);
  if (!p.names.includes(name)) p.names.push(name);
  delete p.dropped[name];
}

function freeSeat(table) {
  return table.order.find((n) => table.seats[n].state === "free");
}

// 鍵を外して owner の手放し中にする（上書きか作り直しが終わったら released で空きに戻る）。
function beginRelease(table, name, owner) {
  dropKey(table, name);
  table.seats[name].state = "releasing";
  table.seats[name].by = { ...owner };
  for (const p of Object.values(table.places)) delete p.dropped[name];
}

// owner が鍵 key の絵を使う。返す値:
// { name, write: true }: 空きの絵の席を割り当てた。owner が書き、wrote を呼ぶ。
// { name, write: false, info }: 同じ鍵の絵がある（共有する。書き直さない）。writing: true なら、ほかのコピーが書いている途中で、
//   書き終わるまで待つ。
// { wait: "init" | "grow" }: 初めての手放しか、絵の席を増やしている途中。あとでもう一度求める。
// { wait: "release" }: 空きが無く、ごく小さい絵で上書きできなかった絵の席がある（増やさずに、それを手放し直してから求める。上書きが
//   続けて失敗しても絵の席を増やし続けないように）。
// { grow: names }: 空きが無い。owner がその名前の絵の席をごく小さい絵で作り、grown を呼んでから、もう一度求める。
// どれも、得た絵の席を owner の使う場所の集まりに入れる。
export function acquire(table, owner, key) {
  if (table.init.state !== "done") return { wait: "init" };
  const held = table.keys[key];
  if (held !== undefined) {
    const s = table.seats[held];
    addName(table, owner.place, held);
    return { name: held, write: false, writing: s.state === "writing", info: s.info };
  }
  const name = freeSeat(table);
  if (name === undefined) {
    if (table.growing) return { wait: "grow" };
    if (table.order.some((n) => table.seats[n].state === "releasing" && !table.seats[n].by)) return { wait: "release" };
    const start = table.order.length;
    table.growing = { ...owner };
    return { grow: Array.from({ length: GROW_SEATS }, (_, i) => seatName(start + i)) };
  }
  table.seats[name] = { state: "writing", key, by: { ...owner }, info: null, rewrite: false };
  table.keys[key] = name;
  addName(table, owner.place, name);
  return { name, write: true };
}

// 絵の席 name の絵が、その鍵の今の中身と違うと分かった（画像の大きさと更新時刻が同じまま中身だけ変わった）。その絵の席から鍵を外し、
// 次にその鍵を求めた所に使っていない絵の席を割り当てる（鍵の形は変えない。ほかのコピーがもう別の絵の席に書き直していれば、そちらの
// 鍵はそのまま）。前の絵の席は、出している所が使い続け、どこも使わなくなったら手放す。
export function unshare(table, name) {
  if (table.seats[name]) dropKey(table, name);
}

// owner が受け持った絵の席を増やすのを、始めずにやめた（ほかのコピーが受け持てるようにする）。
export function stopGrowing(table, owner) {
  if (same(table.growing, owner)) table.growing = null;
}

// 増やした絵の席を作り終えた（空きとして載せる）。failed: 作れなかった絵の席（空きにせず、次の手放しでもう一度作る）。
export function grown(table, names, owner, failed = []) {
  const retry = new Set(failed);
  for (const name of names) {
    if (table.seats[name]) continue;
    table.seats[name] = seat(retry.has(name) ? "releasing" : "free");
    table.order.push(name);
  }
  if (same(table.growing, owner)) table.growing = null;
}

// owner が name を書き終えた。ok でなければ中身が分からないので鍵を外す（使わなくなったら手放す）。無くなった絵の席の書き直しが
// できなかったときは、無くなったままにする（出している所がある絵の席を空きにしない。次の回に書き直し直すか、使う場所が外すまで待つ）。
export function wrote(table, name, owner, { ok, info = null }) {
  const s = table.seats[name];
  if (!s || s.state !== "writing" || !same(s.by, owner)) return;
  s.by = null;
  const rewrite = s.rewrite;
  s.rewrite = false;
  if (ok) {
    s.state = "ready";
    s.info = info;
    return;
  }
  if (rewrite) {
    s.state = "lost";
    return;
  }
  dropKey(table, name);
  s.state = "dirty";
}

function dropKey(table, name) {
  const s = table.seats[name];
  if (s.key !== null && table.keys[s.key] === name) delete table.keys[s.key];
  s.key = null;
  s.info = null;
}

// place が今使っている絵の席の集まり（前に渡したものと置き換える）。外した絵の席には、そのときの描画の回数を覚える。空きと手放し中の
// 絵の席は入れない（もう手放した絵の席を守って、あとでほかの絵に使われたその絵の席を手放せなくならないように）。入れた名前を返す。
export function use(table, place, names) {
  const p = placeOf(table, place);
  const next = new Set(names.filter((name) => table.seats[name] && table.seats[name].state !== "free" && table.seats[name].state !== "releasing"));
  for (const name of p.names) if (!next.has(name)) p.dropped[name] = p.frame;
  for (const name of next) delete p.dropped[name];
  p.names = [...next];
  return p.names;
}

// place のコピーが描画を組み立て終えた（render が返す直前に呼ぶ。打ち切られた描画は戻らないので数えない）。
export function rendered(table, place) {
  placeOf(table, place).frame++;
}

// 拡大の窓の使う場所に、窓が今出している絵（{ file, colorsKey, colors }。ふつうのデータ）を置く。その使う場所の今の世代のコピーだけが
// 置ける。同じ使う場所の新しい世代の窓のコピー（hot reload など）は、これから始める（開いたときの絵に戻らないように）。
export function setShown(table, owner, shown) {
  const p = table.places[owner.place];
  if (p && p.gen === owner.gen) p.shown = shown;
}

export function shownOf(table, place) {
  return table.places[place]?.shown ?? null;
}

// names の絵の席がどれも、place の集まりにあって書き終えたままか（集まりにある間は手放されないので、入れたときの絵のまま）。
// 手放されて空きか別の絵になっていうるなら false。
export function holds(table, place, names) {
  const p = table.places[place];
  return Boolean(p) && names.every((name) => p.names.includes(name) && table.seats[name]?.state === "ready");
}

// place を表から外す（タブや窓を閉じた、見張りが閉じたタブを見つけた、窓を作り直す）。その集まりの絵の席は描画の回数を待たない。
// owner を渡したら、その使う場所の今の世代がそのコピーのときだけ外す（新しい窓に替わったあとで閉じた前の窓が、新しい窓の集まりを
// 外さないように）。
export function dropPlace(table, place, owner = null) {
  if (owner && table.places[place]?.gen !== owner.gen) return;
  delete table.places[place];
}

function releasable(table, name, used) {
  const s = table.seats[name];
  const retry = s.state === "releasing" && !s.by;
  if ((s.state !== "ready" && s.state !== "dirty" && !retry) || used.has(name)) return false;
  for (const p of Object.values(table.places)) {
    if (p.dropped[name] !== undefined && p.frame <= p.dropped[name]) return false;
  }
  return true;
}

// 手放す絵の席（どの集まりにも無く、外した使う場所の描画がどれも外したときより進んでいるものと、前にごく小さい絵で上書きできなかった
// もの）を、owner が手放し中にして返す。
// owner はそれをごく小さい絵で上書きしてから released を呼ぶ。
export function takeReleases(table, owner) {
  if (table.init.state !== "done") return [];
  const used = usedNames(table);
  const out = table.order.filter((n) => releasable(table, n, used));
  for (const name of out) beginRelease(table, name, owner);
  return out;
}

// owner が names をごく小さい絵で上書きし終えた（空きに戻す）。failed: 上書きできなかった名前（空きに戻さず、手放し中のまま次の
// 手放しでもう一度上書きする）。
export function released(table, names, owner, failed = []) {
  const retry = new Set(failed);
  for (const name of names) {
    const s = table.seats[name];
    if (s && s.state === "releasing" && same(s.by, owner)) {
      if (!retry.has(name)) s.state = "free";
      s.by = null;
    }
  }
}

// 止まった世代の印を外す: 書いている途中だった絵の席は中身が分からないので鍵を外し（無くなった絵の席の書き直しなら、無くなったままに
// して使う場所に書き直させ）、手放し中だった絵の席は手放し直す。
// 初めての手放しと絵の席を増やすのを受け持っていたら、ほかのコピーが受け持てるようにする。
function clearMarks(table, stopped) {
  for (const [name, s] of Object.entries(table.seats)) {
    if (!s.by || !stopped(s.by)) continue;
    if (s.state === "writing" && s.rewrite) {
      s.state = "lost";
      s.by = null;
      s.rewrite = false;
    } else if (s.state === "writing" || s.state === "releasing") {
      dropKey(table, name);
      s.state = "dirty";
      s.by = null;
    }
  }
  if (table.init.by && stopped(table.init.by)) table.init.by = null;
  if (table.growing && stopped(table.growing)) table.growing = null;
}

// owner（新しいコピー）が始まった。同じ使う場所の前の世代の印を外す（窓のコピーは窓の使う場所の印だけ、タブのコピーは本文の
// 使う場所の印だけ）。集まりと描画の回数はそのまま引き継ぎ、最初に use を呼ぶまで前の集まりの絵の席を手放さない。
export function startGen(table, owner, now) {
  clearMarks(table, (by) => by.place === owner.place && by.gen !== owner.gen);
  table.gens[owner.gen] = now;
  placeOf(table, owner.place).gen = owner.gen;
}

// owner の見張りの回が動いた（止まっていない印）。
export function beat(table, owner, now) {
  table.gens[owner.gen] = now;
}

// 見張り: 開いているタブ（live: token の Set）のどれでもない使う場所を外し、最後の回から STALE_GEN_MS たった世代の印を外す。
export function watch(table, live, now) {
  for (const place of Object.keys(table.places)) if (!live.has(tokenOf(place))) delete table.places[place];
  const stale = new Set(Object.keys(table.gens).filter((g) => now - table.gens[g] > STALE_GEN_MS));
  if (!stale.size) return;
  clearMarks(table, (by) => stale.has(by.gen));
  for (const g of stale) delete table.gens[g];
}

// フォルダの一覧（無ければ null）と表を突き合わせる。無い絵の席のうち、どこかの集まりにあるものは、鍵の有無（中身の分からない
// 絵の席も）によらず lost にする（空きに戻さず、その使う場所のコピーが書き直す。rewrites）。どこの集まりにも無いものは、lost のまま
// 書き直されずに使う場所が外したものも、鍵を外して owner がごく小さい絵で作る（create。作り終えたら released）。
// 書いている途中と手放し中の絵の席は、書く側がファイルを作るので触らない。
export function scan(table, listing, owner) {
  if (table.init.state !== "done") return { mkdir: false, create: [] };
  const have = new Set(listing ?? []);
  const used = usedNames(table);
  const create = [];
  for (const name of table.order) {
    const s = table.seats[name];
    if (have.has(name) || s.state === "writing" || s.state === "releasing") continue;
    if (used.has(name)) {
      s.state = "lost";
      continue;
    }
    beginRelease(table, name, owner);
    create.push(name);
  }
  return { mkdir: listing === null, create };
}

// place の集まりにある、書き直す絵の席（ファイルが無くなったもの）。
export function rewrites(table, place) {
  const p = table.places[place];
  if (!p) return [];
  return p.names.filter((name) => table.seats[name]?.state === "lost");
}

// owner が無くなった絵の席 name を書き直す（書いている途中にする）なら true。ほかのコピーが先に受け持ったら false（書き終わるのを待つ）。
export function claimRewrite(table, name, owner) {
  const s = table.seats[name];
  if (!s || s.state !== "lost") return false;
  s.state = "writing";
  s.by = { ...owner };
  s.rewrite = true;
  return true;
}
