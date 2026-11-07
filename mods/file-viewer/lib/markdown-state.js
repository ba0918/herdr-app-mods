// markdown viewer の整形表示の見え方の決まり（仕様の「整形の準備」「整形表示の上限」）。
// 出来事（開く、整形表示に入る、ソース表示を選ぶ、中身が変わる、区間を進める、表示しなくなる）を受けて、
// 何を出すか（display）と、準備を捨てる・続ける・やり直すかを決める。画面へのつなぎは main.js。
import { startPreparation, fallbackParts } from "./prepare.js";
import { judgeSize } from "./render-size.js";

// 描画の外の準備が終わらなかったと見なす、準備を動かしている間の時間（ms）。
const TIME_LIMIT = 10_000;

export class MarkdownState {
  // start: 準備を始めるもの（startPreparation）。judge: 大きさの判定（judgeSize）。
  constructor({ start = startPreparation, judge = judgeSize, timeLimit = TIME_LIMIT } = {}) {
    this.start = start;
    this.judge = judge;
    this.timeLimit = timeLimit;
    this.text = null;        // 今の中身
    this.mode = "formatted"; // "formatted" | "source"（出しているのは整形表示の場所か、ソース表示か）
    this.userSource = false; // 利用者がソース表示を選んだか（上限で移したソース表示は含めない）
    this.over = null;        // 整形表示の上限を超えていれば judgeSize の over
    this.shown = null;       // 出している整形表示 { text, parts, fallback }
    this.job = null;         // 描画の外で進めている準備 { text, prep, elapsed, last }
    this.pending = null;     // 前の整形表示を出している間に変わった中身（今の準備が終わったらやり直す）
    this.failure = null;     // 失敗の知らせ { kind: "image", message } | { kind: "timeout" }
  }

  // 描画の外で進める準備があるか。
  get busy() {
    return this.job !== null;
  }

  // タブで開いたとき（開く、プレビュータブの入れ替え、再起動後の復元）。userSource: 記録にある、利用者が選んだソース表示か。
  open(text, { userSource = false } = {}) {
    this.text = text;
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
    this.enterFormatted();
  }

  // 利用者がソース表示に切り替えたとき。「整形中…」の間でも準備は続ける。
  toSource() {
    this.userSource = true;
    this.mode = "source";
  }

  // 中身が変わったとき（ソース表示の打鍵、外部変更の読み直し、下書きの復元）。
  change(text) {
    if (text === this.text) return;
    this.text = text;
    const { inRender, over } = this.judge(text);
    this.over = over;
    if (this.mode === "source" || over) {
      // ソース表示の間は、整形表示に入るまで準備しない（打鍵のたびに区間が動かないように）。上限を超えたらソース表示に移す。
      this.mode = "source";
      this.job = null;
      this.pending = null;
      return;
    }
    if (this.shown && this.job) {
      // 前の整形表示を出している間は、今の準備を最後まで続けて差し替えてから、今の中身でやり直す。
      this.pending = text;
      return;
    }
    if (!this.shown) this.job = null; // 「整形中…」の間は、途中の準備を捨てる
    this.begin(text, inRender);
  }

  // 描画の外の準備を 1 区間進める（budget: ms、now: 今の時刻を返す関数）。まだ進める準備があれば true。
  // 準備を動かしている時間は、区間の時間と区間の間の時間の合計で数える（pause のあとの間は数えない）。
  tick(budget, now) {
    const job = this.job;
    if (!job) return false;
    const begun = now();
    if (job.last !== null) job.elapsed += begun - job.last;
    let done;
    try {
      done = job.prep.advance(budget, now);
    } catch (e) {
      this.fail(job.text, { kind: "image", message: String(e?.message ?? e) });
      return this.busy;
    }
    const ended = now();
    job.elapsed += ended - begun;
    job.last = ended;
    if (done) this.succeed(job.text, job.prep.parts);
    else if (job.elapsed > this.timeLimit) this.fail(job.text, { kind: "timeout" });
    return this.busy;
  }

  // タブを表示しなくなったとき。次の tick まで、準備を動かしている時間に数えない。
  pause() {
    if (this.job) this.job.last = null;
  }

  // 出すもの。整形表示の場所なら { kind: "formatted" | "previous" | "fallback" | "preparing", parts?, notices }、
  // ソース表示なら { kind: "source", notices, formatButton }。notices は知らせ（{ kind: "over", limit, size }・
  // { kind: "image", message }・{ kind: "timeout" }）。
  display() {
    if (this.mode === "source") {
      return { kind: "source", notices: this.over ? [{ kind: "over", ...this.over }] : [], formatButton: !this.over };
    }
    const notices = this.failure ? [this.failure] : [];
    const shown = this.shown;
    if (!shown) return { kind: "preparing", notices };
    const kind = shown.fallback ? "fallback" : shown.text === this.text ? "formatted" : "previous";
    return { kind, parts: shown.parts, notices };
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

  // text の準備を始める。描画の中で済む大きさなら、その場で最後まで進める。
  begin(text, inRender) {
    if (!inRender) {
      this.job = { text, prep: this.start(text), elapsed: 0, last: null };
      return;
    }
    this.job = null;
    const prep = this.start(text);
    try {
      prep.advance(Infinity, () => 0);
    } catch (e) {
      this.fail(text, { kind: "image", message: String(e?.message ?? e) });
      return;
    }
    this.succeed(text, prep.parts);
  }

  succeed(text, parts) {
    this.failure = null;
    this.show({ text, parts, fallback: false });
  }

  fail(text, failure) {
    this.failure = failure;
    this.show({ text, parts: fallbackParts(text), fallback: true });
  }

  // 結果を出し、続きの中身があればやり直す。
  show(shown) {
    this.shown = shown;
    this.job = null;
    const next = this.pending;
    this.pending = null;
    if (next !== null && next !== shown.text) this.begin(next, this.judge(next).inRender);
  }
}

