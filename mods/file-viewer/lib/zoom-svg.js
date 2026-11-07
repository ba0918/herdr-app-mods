// 図の拡大の窓の倍率の書き出し直しの決まり（仕様の「拡大表示」）。
// 倍率やテーマが変わったら、その倍率と色で SVG を書き出し直して出す。書いて app が画像として読み込み終えるまでは、前の倍率・色の
// 絵をその大きさのまま出す（引き伸ばしも縮めもしない）。続けて変わったら最後の倍率だけを書く。書き出し直しの失敗と 10 秒の
// 時間切れは、前の絵のまま知らせる（次に書き出せたら消す）。書き込みそのものは main.js がする。

const TIME_LIMIT = 10_000;
const keyOf = (w) => `${w.scale}|${w.colorsKey}`;

export class ZoomSvg {
  // shown: 今出している絵 { name, path, scale, width, height }（width / height は出す大きさ）。colorsKey: その絵の色の鍵。
  constructor({ shown, colorsKey, timeLimit = TIME_LIMIT }) {
    this.shown = shown;
    this.shownColors = colorsKey;
    this.want = { scale: shown.scale, colorsKey };
    this.writing = null;   // 書いている書き出し { scale, colorsKey }
    this.ready = null;     // 書き終えて、読み込みを待っている { task, file }
    this.loaded = new Set([shown.name]);
    this.notice = null;    // { kind: "write", message } | { kind: "timeout" }
    this.gaveUp = null;    // 失敗・時間切れであきらめた望み（同じ倍率と色のまま書き直し続けない）
    this.since = null;     // 今の望みを待ち始めた時刻
    this.timeLimit = timeLimit;
  }

  satisfied() {
    return this.want.scale === this.shown.scale && this.want.colorsKey === this.shownColors;
  }

  // 倍率が変わったとき（窓に収める倍率を含む）。
  request(scale) {
    if (scale === this.want.scale) return;
    this.want = { ...this.want, scale };
    this.since = null;
  }

  // テーマの色が変わったとき。
  recolor(colorsKey) {
    if (colorsKey === this.want.colorsKey) return;
    this.want = { ...this.want, colorsKey };
    this.since = null;
  }

  // 次に書く書き出し { scale, colorsKey }。書いている間、今の絵で足りるとき、あきらめたとき、読み込みを待っているときは null。
  task() {
    if (this.writing || this.satisfied() || this.gaveUp === keyOf(this.want)) return null;
    if (this.ready && keyOf(this.ready.task) === keyOf(this.want)) return null;
    this.writing = { ...this.want };
    return this.writing;
  }

  // 書き終えたとき。file: { name, path, width, height }。もう望まれていない倍率なら出さない。
  wrote(task, file) {
    if (this.writing === task) this.writing = null;
    if (keyOf(task) !== keyOf(this.want)) return;
    this.ready = { task, file };
    if (this.loaded.has(file.name)) this.swap();
  }

  failed(task, message) {
    if (this.writing === task) this.writing = null;
    if (keyOf(task) !== keyOf(this.want)) return;
    this.notice = { kind: "write", message };
    this.gaveUp = keyOf(this.want);
  }

  // app が画像を読み込み終えたとき。出す絵が替わったら true。
  loadedImage(name) {
    this.loaded.add(name);
    if (this.ready?.file.name !== name || keyOf(this.ready.task) !== keyOf(this.want)) return false;
    this.swap();
    return true;
  }

  swap() {
    const { task, file } = this.ready;
    this.shown = { ...file, scale: task.scale };
    this.shownColors = task.colorsKey;
    this.ready = null;
    this.notice = null;
    this.gaveUp = null;
    this.since = null;
  }

  // 書いたが、まだ読み込んでいない絵（見えない所に置いて読み込ませる）。
  preloads() {
    const r = this.ready;
    return r && keyOf(r.task) === keyOf(this.want) && !this.loaded.has(r.file.name) ? [r.file] : [];
  }

  // 時々呼ぶ見張り（t: 今の時刻）。望みを 10 秒たっても満たせなければ、前の絵のまま知らせる。知らせが出たら true。
  watch(t) {
    if (this.satisfied() || this.gaveUp === keyOf(this.want)) {
      this.since = null;
      return false;
    }
    if (this.since === null) {
      this.since = t;
      return false;
    }
    if (t - this.since <= this.timeLimit) return false;
    this.notice = { kind: "timeout" };
    this.gaveUp = keyOf(this.want);
    return true;
  }

  // 使っている絵の名前（出している絵と、読み込ませている絵）。これ以外の窓の絵は消してよい。
  keep() {
    const names = new Set([this.shown.name]);
    if (this.ready) names.add(this.ready.file.name);
    return names;
  }

  display() {
    return { file: this.shown, notice: this.notice };
  }
}

// 図を押して拡大の窓を開くまでの決まり（仕様の「拡大表示」）。窓に収まる大きさの絵を書いて読み込み終えてから開く。
// 1 秒たっても終わらなければ（書き出しが失敗したら）、本文の絵を本来の大きさで出して開く。
export class DiagramOpening {
  constructor(start, limit = 1000) {
    this.start = start;
    this.limit = limit;
    this.written = false;
    this.isLoaded = false;
    this.error = false;
  }

  wrote() { this.written = true; }
  loaded() { this.isLoaded = true; }
  failed() { this.error = true; }

  // "wait" | "fit"（収まる大きさの絵で開く）| "natural"（本文の絵で開く）。
  decide(now) {
    if (this.error) return "natural";
    if (this.written && this.isLoaded) return "fit";
    return now - this.start >= this.limit ? "natural" : "wait";
  }
}
