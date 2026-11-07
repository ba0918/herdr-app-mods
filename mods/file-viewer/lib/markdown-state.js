// markdown viewer の整形表示の見え方の決まり（仕様の「整形の準備」「整形表示の上限」）。
// 出来事（開く、整形表示に入る、ソース表示を選ぶ、中身が変わる、区間を進める、図の SVG を書いた、表示しなくなる）を受けて、
// 何を出すか（display）と、準備を捨てる・続ける・やり直すかを決める。画面へのつなぎは main.js。
// 図の SVG の書き出しは整形の準備の続き（仕様の「描き方」）で、準備の結果の図を全部書き終えるまで、その結果は出さない。
// 書き出しそのもの（ファイルへの書き込み）は main.js がして、書いた・失敗したを wrote / writeFailed で知らせる。
import { startPreparation, fallbackParts } from "./prepare.js";
import { judgeSize } from "./render-size.js";

// 描画の外の準備が終わらなかったと見なす、準備を動かしている間の時間（ms）。
const TIME_LIMIT = 10_000;

export class MarkdownState {
  // start: 準備を始めるもの（startPreparation）。judge: 大きさの判定（judgeSize）。
  // fileOf(part, look): 図の部分を見た目 look で書き出すファイル（{ name, path, width, height }。lib/diagram-files.js の diagramFile）。
  // 無ければ図の SVG は書き出さない。
  constructor({ start = startPreparation, judge = judgeSize, timeLimit = TIME_LIMIT, fileOf = null } = {}) {
    this.start = start;
    this.judge = judge;
    this.timeLimit = timeLimit;
    this.fileOf = fileOf;
    this.look = null;          // 図の見た目（色と書き出しの大きさ。{ key, ... }）
    this.written = new Set();  // 書いた SVG の名前
    this.entry = "prepare";    // 整形表示に入った形: "load"（開く・プレビュータブの入れ替え）| "prepare"（ソース表示から戻る）
    this.text = null;        // 今の中身
    this.mode = "formatted"; // "formatted" | "source"（出しているのは整形表示の場所か、ソース表示か）
    this.userSource = false; // 利用者がソース表示を選んだか（上限で移したソース表示は含めない）
    this.over = null;        // 整形表示の上限を超えていれば judgeSize の over
    this.shown = null;       // 出している整形表示 { text, parts, fallback, files }（files は図の部分ごとのファイルか null）
    // 進めている準備 { text, prep, parts, inRender, restyle, elapsed, last }。prep を最後まで進めると parts が入り、図の SVG を書く段になる。
    // inRender: 描画の中で準備した結果の書き出しを待っている。restyle: 出している結果を、新しい見た目で書き直している。
    this.job = null;
    this.pending = null;     // 前の整形表示を出している間に変わった中身（今の準備が終わったらやり直す）
    // 失敗の知らせ { kind: "image" | "write", message } | { kind: "timeout" }（代わりの整形表示）
    this.failure = null;
    this.slice = null;       // 区間を進めている準備（区間から戻らなければ残る）
    this.trying = null;      // 描画の中で準備している中身（描画が打ち切られて戻らなければ残る）
  }

  // 描画の外で進める準備があるか。
  get busy() {
    return this.job !== null;
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
    if (this.trying === text) this.begin(text, false);
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

  // 次に書く図の SVG（{ name, path, width, height, part }）。書く段でなければ、または書き終えていれば null。
  writeTask() {
    const job = this.job;
    if (!job?.parts) return null;
    const files = this.filesFor(job.parts);
    const i = files.findIndex((f) => f && !this.written.has(f.name));
    return i < 0 ? null : { ...files[i], part: job.parts[i] };
  }

  // 図の SVG を書いた（または、もうあった）とき。t: 今の時刻。書くのにかかった時間も、準備を動かしている時間に数える。
  wrote(name, t) {
    this.written.add(name);
    const job = this.job;
    if (!job?.parts) return;
    this.count(job, t);
    this.settle(job);
  }

  // 図の SVG を書けなかったとき。代わりの整形表示と知らせにする。
  writeFailed(name, message, t) {
    const job = this.job;
    if (!job?.parts) return;
    this.count(job, t);
    this.fail(job.text, { kind: "write", message });
  }

  // 書いたはずの SVG が無くなっていたとき（起動後の掃除で消えたなど）。出している結果の絵なら、書き直すまで書いていない図と同じに待つ。
  lost(names) {
    for (const name of names) this.written.delete(name);
    const shown = this.shown;
    if (!shown || shown.fallback || !shown.files?.some((f) => f && names.includes(f.name))) return;
    this.shown = null;
    if (this.job && !this.job.restyle) return;
    this.job = { text: shown.text, prep: null, parts: shown.parts, inRender: true, restyle: false, elapsed: 0, last: null };
    this.settle(this.job);
  }

  // 図の見た目（色と書き出しの大きさ）を渡す（描画のたびに）。変わったら、出している結果を新しい見た目で書き直す
  // （書き終えるまで前の見た目の絵を出す）。名前が変わらない図だけなら、そのまま替える。準備の途中なら、新しい見た目で書く。
  setLook(look) {
    if (this.look?.key === look.key) return;
    this.look = look;
    const shown = this.shown;
    if (!shown || shown.fallback || this.job) return;
    const files = this.filesFor(shown.parts);
    if (this.allWritten(files)) {
      this.shown = { ...shown, files };
      return;
    }
    this.job = { text: shown.text, prep: null, parts: shown.parts, inRender: false, restyle: true, elapsed: 0, last: null };
  }

  // 使っている SVG の名前（出している結果と、書いている途中の結果の今の見た目のもの）。これ以外の自分の SVG は消してよい。
  keep() {
    const names = new Set();
    for (const f of this.shown?.files ?? []) if (f) names.add(f.name);
    if (this.job?.parts) for (const f of this.filesFor(this.job.parts)) if (f) names.add(f.name);
    return names;
  }

  // 区間から戻らない準備の見張り（tick の外から、時々呼ぶ。visible: タブを表示しているか）。区間を動かしていた非同期処理が
  // 黙って止まると（ガイドの「長い同期処理」）、tick の 10 秒の判定に戻らないので、ここで数える。止まった準備が今の準備なら、
  // 表示している間の時間で上限を超えたところで終わらなかったことにする。中身が変わって捨てた準備なら待たない。
  // 区間を動かしていたものを手放して、次の準備を始めてよくなったら true。
  watch(now, visible) {
    const job = this.slice;
    if (!job) return false;
    if (job !== this.job) {
      this.slice = null;
      return true;
    }
    if (!visible) {
      job.last = null;
      return false;
    }
    const t = now();
    if (job.last !== null) job.elapsed += t - job.last;
    job.last = t;
    if (job.elapsed <= this.timeLimit) return false;
    this.slice = null;
    this.fail(job.text, { kind: "timeout" });
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
      return;
    }
    this.mode = "formatted";
    this.pending = null;
    if (this.shown?.text !== this.text) this.shown = null;
    if (this.job && this.job.text !== this.text) this.job = null;
    if (!this.shown && !this.job) this.begin(this.text, inRender);
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
    this.show({ text: job.text, parts: job.parts, fallback: false, files });
  }

  timeout(job) {
    this.fail(job.text, { kind: "timeout" });
  }

  allWritten(files) {
    return files.every((f) => !f || this.written.has(f.name));
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
    this.show({ text, parts: fallbackParts(text), fallback: true, files: [] });
  }

  // 結果を出し、続きの中身があればやり直す。続きは区間の続き（tick）や見張りの中で始まり、描画の中で済む大きさの中身を
  // その場で一度に進めると、止まったときに見張りも 10 秒の上限も効かないので、次の描画（sync）に任せる。
  show(shown) {
    this.shown = shown;
    this.job = null;
    const next = this.pending;
    this.pending = null;
    if (next !== null && next !== shown.text && !this.judge(next).inRender) this.begin(next, false);
  }
}
