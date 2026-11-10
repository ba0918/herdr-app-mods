// markdown viewer の整形表示の見え方の決まり（仕様の「整形の準備」「整形表示の上限」）。
// 出来事（開く、整形表示に入る、ソース表示を選ぶ、中身が変わる、区間を進める、図の SVG を書いた、表示しなくなる）を受けて、
// 何を出すか（display）と、準備を捨てる・続ける・やり直すかを決める。画面へのつなぎは main.js。
// 図の SVG の書き出しは整形の準備の続き（仕様の「描き方」）で、準備の結果の図を全部書き、app が画像として読み込み終えるまで、
// その結果は出さない。書き出しそのもの（ファイルへの書き込み）は main.js がして、書いた・失敗したを wrote / writeFailed で、
// 見えない所に置いて読み込ませた画像（preloads）が読み込み終えたことを loadedImage で知らせる。
import { startPreparation, fallbackParts } from "./prepare.js";
import { judgeSize } from "./render-size.js";

// 図のファイルの SVG の並び（大きな絵はタイルに分かれる。lib/diagram-files.js）。
const tilesOf = (f) => f.tiles ?? [f];

// 描画の外の準備が終わらなかったと見なす、準備を動かしている間の時間（ms）。
const TIME_LIMIT = 10_000;

export class MarkdownState {
  // start: 準備を始めるもの（startPreparation）。judge: 大きさの判定（judgeSize）。
  // fileOf(part, look): 図の部分を見た目 look で書き出すファイル（{ name, path, width, height }。lib/diagram-files.js の diagramFile）。
  // 無ければ図の SVG は書き出さない。preloadWait: 書き終えてから見えない所で読み込ませるまで待つ時間（ms。絵の席に書いた絵自身の
  // 変化の知らせが読み込みのあとに届くと、読み込んだ絵が捨てられて一瞬空白になるので。ガイドの「フォルダの変化の知らせ」）。
  constructor({ start = startPreparation, judge = judgeSize, timeLimit = TIME_LIMIT, fileOf = null, preloadWait = 0 } = {}) {
    this.start = start;
    this.judge = judge;
    this.timeLimit = timeLimit;
    this.fileOf = fileOf;
    this.preloadWait = preloadWait;
    this.look = null;          // 図の見た目（色と書き出しの大きさ。{ key, ... }）
    this.written = new Set();  // 書いた SVG の名前
    this.wroteAt = new Map();  // 書いた SVG の名前 → 書き終えた時刻
    this.loaded = new Set();   // app が画像として読み込み終えた SVG の名前（読み込む前に出すと、図の場所が空いて見える）
    this.entry = "prepare";    // 整形表示に入った形: "load"（開く・プレビュータブの入れ替え）| "prepare"（ソース表示から戻る）
    this.text = null;        // 今の中身
    this.mode = "formatted"; // "formatted" | "source"（出しているのは整形表示の場所か、ソース表示か）
    this.userSource = false; // 利用者がソース表示を選んだか（上限で移したソース表示は含めない）
    this.over = null;        // 整形表示の上限を超えていれば judgeSize の over
    // 出している整形表示 { text, parts, fallback, files, look }（files は図の部分ごとのファイルか null。look はその files の見た目）
    this.shown = null;
    // 整形表示に入るときに捨てた、前に出していた結果（shown と同じ形）。次の結果を出すまで、その SVG を使っている名前に残す
    // （準備の結果が出るまで、中身の変わらない図の SVG を消して書き直さないように）。
    this.held = null;
    // 進めている準備 { text, prep, parts, inRender, restyle, elapsed, last }。prep を最後まで進めると parts が入り、図の SVG を書く段になる。
    // inRender: 描画の中で準備した結果の書き出しを待っている。restyle: 出している結果を、新しい見た目で書き直している。
    this.job = null;
    this.pending = null;     // 前の整形表示を出している間に変わった中身（今の準備が終わったらやり直す）
    // 失敗の知らせ { kind: "image" | "write", message } | { kind: "timeout" }（代わりの整形表示）、
    // { kind: "restyle-write", message } | { kind: "restyle-timeout" }（書き直しの失敗。前の見た目の絵のまま出す）
    this.failure = null;
    this.slice = null;       // 区間を進めている準備（区間から戻らなければ残る）
    this.trying = null;      // 描画の中で準備している中身（描画が打ち切られて戻らなければ残る）
  }

  // 描画の外で進める準備があるか。
  get busy() {
    return this.job !== null;
  }

  // 見張り（watch）が見る要があるか: 描画の外で進める準備があるか、今の中身の描画の中の準備が戻っていないか。
  get watched() {
    return this.busy || this.interrupted;
  }

  // 今の中身の描画の中の準備が戻っていない（その描画が打ち切られた）か。
  get interrupted() {
    return this.trying !== null && this.trying === this.text;
  }

  // タブで開いたとき（開く、プレビュータブの入れ替え、再起動後の復元）。userSource: 記録にある、利用者が選んだソース表示か。
  open(text, { userSource = false } = {}) {
    this.text = text;
    this.entry = "load";
    this.userSource = userSource;
    if (userSource) {
      this.mode = "source";
      this.over = this.judge(text).over;
      return;
    }
    this.enterFormatted();
  }

  // 利用者が整形表示に切り替えたとき。
  enter() {
    this.userSource = false;
    this.entry = "prepare";
    this.enterFormatted();
  }

  // 利用者がソース表示に切り替えたとき。「整形中…」の間でも準備は続ける。
  toSource() {
    this.userSource = true;
    this.mode = "source";
  }

  // 描画のたびに、今の中身を渡す。変わっていれば change と同じ。同じ中身で、描画の中の準備が戻っていなければ、
  // その描画は打ち切られた（ガイドの「描画の時間」）と見なし、同じ中身の準備を描画の外の準備（区切り、見張り、10 秒の上限）に移す。
  // 整形表示の場所で、今の中身の準備がまだ始まっていなければ（区間の続きから任された描画の中で済む大きさの中身）、ここで始める。
  sync(text) {
    if (text !== this.text) {
      this.change(text);
      return;
    }
    if (this.interrupted) this.begin(text, false);
    else if (this.mode === "formatted" && !this.job && this.shown?.text !== text) this.begin(text, this.judge(text).inRender);
  }

  // 中身が変わったとき（ソース表示の打鍵、外部変更の読み直し、下書きの復元）。
  change(text) {
    if (text === this.text) return;
    this.text = text;
    this.trying = null;
    const { inRender, over } = this.judge(text);
    this.over = over;
    if (this.mode === "source" || over) {
      // ソース表示の間は、整形表示に入るまで準備しない（打鍵のたびに区間が動かないように）。上限を超えたらソース表示に移す。
      this.mode = "source";
      this.job = null;
      this.pending = null;
      if (over) this.dropShown();
      return;
    }
    if (this.shown && this.job && !this.job.restyle) {
      // 前の整形表示を出している間は、今の準備を最後まで続けて差し替えてから、今の中身でやり直す。
      this.pending = text;
      return;
    }
    // 出している結果を新しい見た目で書き直している途中なら、それはやめて、新しい中身と見た目で準備する。
    if (this.job?.restyle) this.job = null;
    if (!this.shown) this.job = null; // 「整形中…」の間は、途中の準備を捨てる
    this.begin(text, inRender);
  }

  // 描画の外の準備を 1 区間進める（budget: ms、now: 今の時刻を返す関数）。まだ進める準備があれば true。
  // 準備を動かしている時間は、区間の時間と区間の間の時間の合計で数える（pause のあとの間は数えない）。
  // 図の SVG を書く段では、区間の間の時間を数えて、書き終えていれば結果を出す。
  tick(budget, now) {
    const job = this.job;
    if (!job) return false;
    const begun = now();
    if (job.last !== null) job.elapsed += begun - job.last;
    job.last = begun;
    if (job.parts) {
      this.settle(job);
      return this.busy;
    }
    this.slice = job;
    let done;
    try {
      done = job.prep.advance(budget, now);
    } catch (e) {
      this.slice = null;
      this.fail(job.text, { kind: "image", message: String(e?.message ?? e) });
      return this.busy;
    }
    const ended = now();
    this.slice = null;
    job.elapsed += ended - begun;
    job.last = ended;
    if (done) {
      job.parts = job.prep.parts;
      this.settle(job);
    } else if (job.elapsed > this.timeLimit) this.timeout(job);
    return this.busy;
  }

  // 次に書く図の SVG（タイル 1 枚。{ name, path, x, y, width, height, file, part }。file は図のファイル全体）。
  // 書く段でなければ、書き終えていれば null。
  writeTask() {
    const job = this.job;
    if (!job?.parts) return null;
    const files = this.filesFor(job.parts);
    for (const [i, f] of files.entries()) {
      if (!f) continue;
      const tile = tilesOf(f).find((t) => !this.written.has(t.name));
      if (tile) return { ...tile, file: f, part: job.parts[i] };
    }
    return null;
  }

  // 描画の外で進める処理（準備の区間か、SVG の書き込み）があるか。画像の読み込みだけを待っているときは false。
  get needsRun() {
    const job = this.job;
    return job !== null && (!job.parts || this.writeTask() !== null);
  }

  // 書いて preloadWait たったが、app がまだ画像として読み込んでいない SVG（見えない所に置いて読み込ませる）。now: 今の時刻。
  preloads(now = Infinity) {
    return this.unloaded().filter((t) => now - this.wroteAt.get(t.name) >= this.preloadWait);
  }

  // 書いたがまだ preloadWait たっていない SVG が、読み込ませてよくなる最初の時刻。無ければ null。
  preloadDue(now) {
    const due = this.unloaded().map((t) => this.wroteAt.get(t.name) + this.preloadWait).filter((at) => at > now);
    return due.length ? Math.min(...due) : null;
  }

  unloaded() {
    const job = this.job;
    if (!job?.parts) return [];
    return this.filesFor(job.parts).flatMap((f) => (f ? tilesOf(f) : [])).filter((t) => this.written.has(t.name) && !this.loaded.has(t.name));
  }

  // 図のファイルの名前を取り直す（絵の席の割り当てを待っていて、仮の名前を受け取っていたとき）。
  refresh() {
    this.memo = null;
  }

  // 絵の席の名前を新しく使い始めた（手放したあとに同じ名前が別の絵に使われるので、その名前の絵を書いた・読み込んだことを忘れる）。
  fresh(name) {
    this.written.delete(name);
    this.wroteAt.delete(name);
    this.loaded.delete(name);
  }

  // app が SVG を画像として読み込み終えたとき。t: 今の時刻。出すものが変わったら true。
  loadedImage(name, t) {
    if (this.loaded.has(name)) return false;
    this.loaded.add(name);
    const job = this.job;
    if (!job?.parts) return false;
    const shown = this.shown;
    this.count(job, t);
    this.settle(job);
    return this.shown !== shown;
  }

  // 図の SVG を書いた（または、もうあった）とき。t: 今の時刻。書くのにかかった時間も、準備を動かしている時間に数える。
  wrote(name, t) {
    this.written.add(name);
    this.wroteAt.set(name, t);
    const job = this.job;
    if (!job?.parts) return;
    this.count(job, t);
    this.settle(job);
  }

  // 図の SVG を書けなかったとき。最初の書き出しなら代わりの整形表示と知らせにし、出している結果の書き直し（テーマや本文の幅が
  // 変わった）なら、前の見た目の絵のまま知らせる（仕様の「色」）。今の準備が使わない図（中身や見た目が変わって捨てた準備の図）
  // なら、何もしない。
  writeFailed(name, message, t) {
    const job = this.job;
    if (!job?.parts || !this.filesFor(job.parts).some((f) => f && tilesOf(f).some((t) => t.name === name))) return;
    this.count(job, t);
    if (job.restyle) {
      this.job = null;
      this.failure = { kind: "restyle-write", message };
      return;
    }
    this.fail(job.text, { kind: "write", message });
  }

  // 書いた絵の席のファイルが外から消されたとき（見張りが見つけて、呼ぶ側が書き直す絵の席を受け持ったとき）。出している結果の絵なら、
  // 同じ絵の席に書き直し、書いて読み込み終えるまで出している結果を出し続ける（仕様の「描き方」）。名前は変わらない。
  lost(names) {
    for (const name of names) this.fresh(name);
    const shown = this.shown;
    if (!shown || shown.fallback || this.job || !shown.files?.some((f) => f && tilesOf(f).some((t) => names.includes(t.name)))) return;
    this.job = { text: shown.text, prep: null, parts: shown.parts, inRender: false, restyle: true, elapsed: 0, last: null };
  }

  // 無くなった絵の席 name に書き直す図のタイル { tile, file, part, look }（file は図のファイル全体、look はその絵の見た目）。
  // 書いている途中の結果の今の見た目の絵、出している結果の絵、整形表示に入るときに捨てた前の結果の絵の順に探す（出している結果が
  // 前の見た目のままのこともある）。使っていない名前なら null。
  lostTile(name) {
    const results = [this.job?.parts && { parts: this.job.parts, files: this.filesFor(this.job.parts), look: this.look }, this.shown, this.held];
    for (const r of results) {
      if (!r?.files || !r.look) continue;
      for (const [i, file] of r.files.entries()) {
        const tile = file && tilesOf(file).find((t) => t.name === name);
        if (tile) return { tile, file, part: r.parts[i], look: r.look };
      }
    }
    return null;
  }

  // 図の見た目（色と書き出しの大きさ）を渡す（描画のたびに）。変わったら、出している結果を新しい見た目で書き直す
  // （書き終えるまで前の見た目の絵を出す）。名前が変わらない図だけなら、そのまま替える。準備の途中なら、新しい見た目で書く。
  // 書く段の途中なら、新しい見た目の図がもう書けて読み込めていればその場で出す（出している見た目に戻ったときは書き直しを終える。
  // 書く・読み込む知らせはもう来ないので、待つと 10 秒で終わらなかったことになる）。出している結果の書き直しの 10 秒は、
  // 最後の見た目から数え直す（倍率や本文の幅を続けて変えても、最後の見た目の書き直しを始める）。
  setLook(look) {
    if (this.look?.key === look.key) return;
    this.look = look;
    if (this.job?.parts) {
      if (this.job.restyle) {
        this.job.elapsed = 0;
        this.job.last = null;
      }
      this.settle(this.job);
      return;
    }
    const shown = this.shown;
    if (!shown || shown.fallback || this.job) return;
    const files = this.filesFor(shown.parts);
    if (this.allWritten(files)) {
      this.shown = { ...shown, files, look };
      return;
    }
    this.job = { text: shown.text, prep: null, parts: shown.parts, inRender: false, restyle: true, elapsed: 0, last: null };
  }

  // 使っている SVG の名前（出している結果か、整形表示に入るときに捨てた前の結果と、書いている途中の結果の今の見た目のもの）。
  // これ以外の自分の SVG は手放してよい。代わりの整形表示と描けない図は絵を持たない。整形表示の上限を超えている間は、整形表示に
  // 戻れないので前の絵を持たない（利用者が選んだソース表示の間は、上限を超えるまで持つ）。
  keep() {
    const names = new Set();
    if (this.over) return names;
    for (const f of [...(this.shown?.files ?? []), ...(this.held?.files ?? [])]) if (f) for (const t of tilesOf(f)) names.add(t.name);
    if (this.job?.parts) for (const f of this.filesFor(this.job.parts)) if (f) for (const t of tilesOf(f)) names.add(t.name);
    return names;
  }

  // 区間から戻らない準備の見張り（tick の外から、時々呼ぶ。visible: タブを表示しているか）。見張りは区間の外でしか動かないので、
  // 区間がまだ残っていれば、区間を動かしていた非同期処理は黙って止まっている（ガイドの「長い同期処理」）。止まった準備が今の準備なら、
  // 止まってから気づくまでの間も表示している間の時間に数え、上限を超えていれば終わらなかったことにし、超えていなければ準備を始めからやり直す
  // （止まった単位の途中までの変化が残っていても、結果が一度に準備したときと同じになるように）。中身が変わって捨てた準備なら待たない。
  // 区間を動かしていたものを手放して、次の準備を始めてよくなったら true。
  // 今の中身の描画の中の準備が戻っていなければ、その描画は打ち切られたと見なし、次の描画を待たずに（打ち切りのあとに描き直しが
  // 来るとは限らない）同じ中身の準備を描画の外の準備に移して true（sync と同じ）。
  watch(now, visible) {
    if (this.interrupted) {
      this.begin(this.text, false);
      return true;
    }
    if (!this.slice && this.job?.parts) return this.watchLoads(now, visible);
    const job = this.slice;
    if (!job) return false;
    this.slice = null;
    if (job !== this.job) return true;
    if (visible) this.count(job, now());
    else job.last = null;
    if (job.elapsed > this.timeLimit) {
      this.fail(job.text, { kind: "timeout" });
      return true;
    }
    job.prep = this.start(job.text);
    return true;
  }

  // 画像の読み込みを待つ間（区間も書き込みも無く、知らせを待つだけ）の時間を、表示している間だけ数える。終わらなかったら true。
  watchLoads(now, visible) {
    const job = this.job;
    if (!visible) {
      job.last = null;
      return false;
    }
    this.count(job, now());
    if (job.elapsed <= this.timeLimit) return false;
    this.timeout(job);
    return true;
  }

  // タブを表示しなくなったとき。次の tick まで、準備を動かしている時間に数えない。
  pause() {
    if (this.job) this.job.last = null;
  }

  // 出すもの。整形表示の場所なら { kind: "formatted" | "previous" | "fallback" | "preparing" | "loading", parts?, notices }
  // （図の部分は、書いた SVG を file に持つ）、
  // ソース表示なら { kind: "source", notices, formatButton }。notices は知らせ（{ kind: "over", by: "bytes" | "diagrams", limit, size }・
  // { kind: "image", message }・{ kind: "timeout" }）。
  display() {
    if (this.mode === "source") {
      const over = this.over && { kind: "over", by: this.over.kind, limit: this.over.limit, size: this.over.size };
      return { kind: "source", notices: over ? [over] : [], formatButton: !over };
    }
    const notices = this.failure ? [this.failure] : [];
    const shown = this.shown;
    // 開くときに描画の中で済ませた文書の図を書いている間は、読み込み中の見え方のまま待つ（仕様の「整形の準備」）。
    if (!shown) return { kind: this.job?.inRender && this.entry === "load" ? "loading" : "preparing", notices };
    const kind = shown.fallback ? "fallback" : shown.text === this.text ? "formatted" : "previous";
    const parts = shown.files?.some(Boolean) ? shown.parts.map((p, i) => (shown.files[i] ? { ...p, file: shown.files[i] } : p)) : shown.parts;
    return { kind, parts, notices };
  }

  // 整形表示に入る。上限を超えていればソース表示に移す。前の中身の整形表示は出さない。
  enterFormatted() {
    const { inRender, over } = this.judge(this.text);
    this.over = over;
    if (over) {
      this.mode = "source";
      this.job = null;
      this.pending = null;
      this.dropShown();
      return;
    }
    this.mode = "formatted";
    this.pending = null;
    if (this.shown && this.shown.text !== this.text) {
      this.held = this.shown;
      this.shown = null;
    }
    if (this.job && this.job.text !== this.text) this.job = null;
    if (!this.shown && !this.job) this.begin(this.text, inRender);
  }

  // 整形表示の上限を超えた。前の結果は、整形表示に戻れないので持たない（その絵は手放されるので、上限を下回って戻ったときも出さない）。
  dropShown() {
    this.shown = null;
    this.held = null;
  }

  // text の準備を始める。描画の中で済む大きさなら、その場で最後まで進め、図の SVG を書く段にする。
  begin(text, inRender) {
    this.trying = null;
    if (!inRender) {
      this.job = { text, prep: this.start(text), parts: null, inRender: false, restyle: false, elapsed: 0, last: null };
      return;
    }
    this.job = null;
    this.trying = text;
    const prep = this.start(text);
    try {
      prep.advance(Infinity, () => 0);
    } catch (e) {
      this.trying = null;
      this.fail(text, { kind: "image", message: String(e?.message ?? e) });
      return;
    }
    this.trying = null;
    this.job = { text, prep: null, parts: prep.parts, inRender: true, restyle: false, elapsed: 0, last: null };
    this.settle(this.job);
  }

  // t までの時間を、準備を動かしている時間に数える（pause のあとの間は数えない）。
  count(job, t) {
    if (job.last !== null) job.elapsed += t - job.last;
    job.last = t;
  }

  // 書く段の準備: 時間を超えていれば終わらなかったことにし、図を全部書き終えていれば結果を出す。
  settle(job) {
    if (job.elapsed > this.timeLimit) {
      this.timeout(job);
      return;
    }
    const files = this.filesFor(job.parts);
    if (!this.allWritten(files)) return;
    this.failure = null;
    this.show({ text: job.text, parts: job.parts, fallback: false, files, look: this.look });
  }

  // 10 秒で終わらなかったとき。出している結果の書き直しなら、前の見た目の絵のまま知らせる。
  timeout(job) {
    if (job.restyle) {
      this.job = null;
      this.failure = { kind: "restyle-timeout" };
      return;
    }
    this.fail(job.text, { kind: "timeout" });
  }

  allWritten(files) {
    return files.every((f) => !f || tilesOf(f).every((t) => this.written.has(t.name) && this.loaded.has(t.name)));
  }

  // 準備の結果の部分ごとの、今の見た目で書く SVG（図でない部分と描けない図は null）。同じ結果と見た目なら覚えておいたものを返す。
  filesFor(parts) {
    const key = this.look?.key ?? null;
    if (this.memo?.parts === parts && this.memo.key === key) return this.memo.files;
    const files = parts.map((p) => (this.fileOf && this.look && p.type === "mermaid" && p.layout ? this.fileOf(p, this.look) : null));
    this.memo = { parts, key, files };
    return files;
  }

  fail(text, failure) {
    this.failure = failure;
    this.show({ text, parts: fallbackParts(text), fallback: true, files: [], look: null });
  }

  // 結果を出し、続きの中身があればやり直す。続きは区間の続き（tick）や見張りの中で始まり、描画の中で済む大きさの中身を
  // その場で一度に進めると、止まったときに見張りも 10 秒の上限も効かないので、次の描画（sync）に任せる。
  show(shown) {
    this.shown = shown;
    this.held = null;
    this.job = null;
    const next = this.pending;
    this.pending = null;
    if (next !== null && next !== shown.text && !this.judge(next).inRender) this.begin(next, false);
  }
}
