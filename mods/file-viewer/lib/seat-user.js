// コピー（タブか拡大の窓）が絵の席の表（lib/seats.js）を使う形。表は窓に 1 つのふつうのデータで、これはコピーごとの手元の覚え。
// 鍵から絵の席の名前を取り（その場で割り当てられなければ仮の名前を返して、待つわけを覚える）、自分が書く絵の席と書いている途中の
// 絵の席を覚え、今使っている絵の席を表に渡す。
import { acquire, wrote as seatWrote, use as seatUse, isSeatName, rewrites, claimRewrite, stopGrowing, toGrow, grown } from "./seats.js";

export class SeatUser {
  constructor(table, owner) {
    this.table = table;
    this.owner = owner;
    this.mine = new Set();     // 書く印を受けて、まだ書き終えていない絵の席
    this.inflight = new Set(); // 書いている途中の絵の席
    this.held = new Set();     // このコピーが今使っている絵の席（最後に use で渡したものと、そのあと取ったもの）
    this.blocked = null;       // 割り当てを待つわけ（{ wait } | { grow }）。呼ぶ側が片付けて null に戻す（増やし終えたら、残った同じ増やす指示は grow が消す）
    this.growing = null;       // 増やす指示の絵の席を作っている途中の印（grow）
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
  // 割り当てられなければ name は無く、待つわけを blocked に覚える（増やす指示は、前に覚えた待つわけより先にする。捨てると、増やす
  // 受け持ちが残ったまま誰も増やさない）。
  take(key) {
    const r = acquire(this.table, this.owner, key);
    if (r.name === undefined) {
      if (r.grow) this.blocked = { grow: r.grow };
      else this.blocked ??= { wait: r.wait };
      return r;
    }
    if (r.write) this.mine.add(r.name);
    return r;
  }

  // このコピーの使う場所にある、ファイルが無くなった絵の席（書き直す）。
  lostSeats() {
    return rewrites(this.table, this.owner.place);
  }

  // 無くなった絵の席 name を書き直すのを受け持つ（受け持てたら true で、自分が書く絵の席になる。ほかのコピーが受け持ったら false）。
  claim(name) {
    if (!claimRewrite(this.table, name, this.owner)) return false;
    this.mine.add(name);
    return true;
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

  // 増やす指示の絵の席 names を write（名前を受けてごく小さい絵で作り、作れなかった名前を返す）で作り、表に載せる。作るのは、この
  // コピーが増やすのを受け持っている間の、表にまだ無い名前だけ。作っている途中にまた呼ばれたら（作り終える前に同じ指示をまた受けた）、
  // 作り直さずにそれが終わるのを待ち、作り終えたら、その間に受けて blocked に残った同じ指示を消す（増やし終えたあとに古い指示で
  // もう一度作ると、先に作り終えて絵を書いた絵の席をごく小さい絵で上書きするので）。
  async grow(names, write) {
    this.growing ??= (async () => {
      try {
        const create = toGrow(this.table, names, this.owner);
        if (create) grown(this.table, create, this.owner, create.length ? await write(create) : []);
      } finally {
        this.growing = null;
        if (this.blocked?.grow?.join() === names.join()) this.blocked = null;
      }
    })();
    await this.growing;
  }

  // このコピーが書くのを止める（表示しなくなって描画の外の準備を止めた、閉じた）。書く印を受けて書き始めていない絵の席は、書かずに
  // 印を外し（中身の分からない絵の席になって鍵が外れ、同じ鍵を求めたほかのコピーは使っていない絵の席に自分で書く。無くなった絵の席の
  // 書き直しなら無くなったままにする）、受け持った絵の席を増やす指示をまだ始めていなければ、受け持ちを外す。書いている途中の絵の席と
  // 作っている途中の増やす絵の席は、終わるまで印を残す。
  stop() {
    for (const name of [...this.mine]) if (!this.inflight.has(name)) this.wrote(name, { ok: false });
    if (this.blocked?.grow) {
      this.blocked = null;
      if (!this.growing) stopGrowing(this.table, this.owner);
    }
  }

  // 今使っている絵の席（仮の名前は除く）を表に渡す。表が集まりに入れなかった絵の席（空きと手放し中）は持っていないことにする
  // （次に取ったら、新しく使い始めた名前として知らせる）。書く印を受けたが書き始めずに使わなくなった絵の席は、書かずに印を外す
  // （中身が分からない絵の席として、手放す）。
  use(names) {
    const seats = [...new Set(names)].filter(isSeatName);
    const using = new Set(seats);
    for (const name of [...this.mine]) {
      if (!using.has(name) && !this.inflight.has(name)) this.wrote(name, { ok: false });
    }
    this.held = new Set(seatUse(this.table, this.owner.place, seats));
  }
}
