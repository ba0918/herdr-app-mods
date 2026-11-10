// コピー（タブか拡大の窓）が絵の席の表（lib/seats.js）を使う形。表は窓に 1 つのふつうのデータで、これはコピーごとの手元の覚え。
// 鍵から絵の席の名前を取り（その場で割り当てられなければ仮の名前を返して、待つわけを覚える）、自分が書く絵の席と書いている途中の
// 絵の席を覚え、今使っている絵の席を表に渡す。
import { acquire, wrote as seatWrote, use as seatUse, isSeatName } from "./seats.js";

export class SeatUser {
  constructor(table, owner) {
    this.table = table;
    this.owner = owner;
    this.mine = new Set();     // 書く印を受けて、まだ書き終えていない絵の席
    this.inflight = new Set(); // 書いている途中の絵の席
    this.held = new Set();     // このコピーが今使っている絵の席（最後に use で渡したものと、そのあと取ったもの）
    this.blocked = null;       // 割り当てを待つわけ（{ wait } | { grow }）。呼ぶ側が片付けて null に戻す
    this.waits = 0;
  }

  // 鍵 key の絵の席の名前。このコピーが新しく使い始めた名前なら fresh(name) を呼ぶ（呼ぶ側は、その名前の絵を書いた・読み込んだ
  // ことを忘れる。手放したあとに同じ名前が別の絵に使われるので）。割り当てられなければ、絵の席の名前の形でない仮の名前を返す。
  nameOf(key, fresh) {
    const r = this.take(key);
    if (r.name === undefined) return `waiting-${++this.waits}`;
    if (!this.held.has(r.name)) {
      this.held.add(r.name);
      fresh?.(r.name);
    }
    return r.name;
  }

  // 鍵 key の絵の席を取る（lib/seats.js の acquire の結果。画像のコピーのように、共有した絵の席の中身の情報が要るときに使う）。
  // 割り当てられなければ name は無く、待つわけを blocked に覚える。
  take(key) {
    const r = acquire(this.table, this.owner, key);
    if (r.name === undefined) {
      this.blocked ??= r.grow ? { grow: r.grow } : { wait: r.wait };
      return r;
    }
    if (r.write) this.mine.add(r.name);
    return r;
  }

  // name を書くのはこのコピーか（書く印を受けて、まだ書き終えていない）。
  mustWrite(name) {
    return this.mine.has(name);
  }

  writing(name) {
    this.inflight.add(name);
  }

  // name を書き終えた（ok でなければ失敗。中身が分からないので、使わなくなったら手放す）。
  wrote(name, { ok, info = null }) {
    this.inflight.delete(name);
    this.mine.delete(name);
    seatWrote(this.table, name, this.owner, { ok, info });
  }

  // 今使っている絵の席（仮の名前は除く）を表に渡す。書く印を受けたが書き始めずに使わなくなった絵の席は、書かずに印を外す
  // （中身が分からない絵の席として、手放す）。
  use(names) {
    const seats = [...new Set(names)].filter(isSeatName);
    const using = new Set(seats);
    for (const name of [...this.mine]) {
      if (!using.has(name) && !this.inflight.has(name)) this.wrote(name, { ok: false });
    }
    this.held = using;
    seatUse(this.table, this.owner.place, seats);
  }
}
