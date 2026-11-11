// image viewer の SVG を、画面に出す大きさで書き直したコピーで出す見え方（仕様の「表示の大きさで書き直す」）。
// .mmd（lib/mmd.js）と同じく、Markdown の整形表示の決まり（lib/markdown-state.js）で、ファイル全体を部分 1 つの文書として扱う。
// 中身は { text, key }: text は SVG の全文、key は同じファイル（machine・パス）の同じ中身を見分ける鍵の元（svgSource）。
// 部分の配置の大きさは書かれた大きさで、書き出しは根の要素を書き換えた全文（lib/svg-root.js の rewriteSvg。main.js が書く）。
import { readSvgRoot, styleScanner } from "./svg-root.js";
import { MarkdownState } from "./markdown-state.js";
import { scaleLook, fitLook, maxSvgScale, svgDrawable, svgStyleWanted } from "./diagram-files.js";

// content の準備。1 単位（根の要素を読む）で終わる。parts は SVG の部分 1 つ: { type: "svg", source, text, root, layout }。
// styled: content が <style> 要素を持つか（確かめていなければ null。lib/diagram-files.js の maxSvgScale）。
// layout（{ width, height, styled }）の無い部分は書き直さない: 書かれた大きさが決められない SVG は asis（元のままコピーする）、
// app が描けない SVG と、書く大きさの上限の中で短い辺が 1 px に満たないほど縦横の比が極端な SVG は error（{ message }）を持つ。
// <style> 要素を確かめておらず、タイルに分ければ書ける SVG は、確かめるまで書かない（unchecked: 書く大きさを決める layout）。
export function startSvgPreparation(content, styled = null) {
  const prep = {
    parts: [], done: false, failed: false,
    advance() {
      if (!prep.done) {
        const root = readSvgRoot(content.text);
        const part = { type: "svg", source: content.key, text: content.text, root };
        const layout = root.kind === "rewrite" ? { width: root.width, height: root.height, styled } : null;
        if (layout && svgDrawable(layout)) part.layout = layout;
        else if (layout && styled === null && svgDrawable({ ...layout, styled: false })) part.unchecked = layout;
        else if (layout) part.error = { message: "縦横の比が極端で表示できない" };
        else if (root.kind === "asis") part.asis = true;
        else part.error = { message: root.reason };
        prep.parts.push(part);
        prep.done = true;
      }
      return true;
    },
  };
  return prep;
}

const OUTSIDE = () => ({ inRender: false, over: null });

// image viewer の SVG の見え方の決まり。出し方だけが MarkdownState と違う: 開けない案内（開くときの失敗の代わりの整形表示か、
// app が描けない部分）を出している間に中身が変わったら、開くときと同じく、新しい中身の準備の間は読み込み中にする（前の理由の案内の
// ままにしない。Markdown と .mmd は、新しい結果が出るまで代わりの整形表示のまま）。
// <style> 要素の有無（タイルに分けるか）は、出している今の中身の絵がタイルに分けたい大きさのとき（svgStyleWanted）だけ、描画の外で
// 区切りごとに 1 区間で確かめる（tick。区切りの間は呼ぶ側が入出力の await を挟む）。確かめ終えるまでは、タイルに分けない 1 枚で書いた
// 絵を出す。確かめ終えたら、分かった有無で今の中身を準備し直す（書き終えて読み込むまで、出している絵のまま）。
// 確かめにも準備の区間と同じ見張りと 10 秒の上限を当てる（区切りの前に slice の印を置く。watch）。上限を超えたら打ち切る（timedOut）。
// 書いた絵を出している間に中身が変わり、新しい中身の確かめが要るときは、確かめてから準備し直し、書き終えて読み込むまで前の絵を出す
// （確かめる間に、タイルに分けない 1 枚の絵や読み込み中を挟まない。仕様の「中身が変わったら確かめ直す」。deferred）。
class SvgFileState extends MarkdownState {
  constructor(options) {
    super(options);
    this.start = (content) => startSvgPreparation(content, this.styledOf(content));
    this.checked = null;   // <style> 要素を確かめ終えた中身 { content, styled }
    // 確かめている中身 { content, scanner, elapsed, last }。elapsed は確かめを動かした時間（区切りの時間と、区切りから戻らなかった
    // 時間。区切りの間は数えない: 確かめが要らなくなって止めている間もあるので）、last は今の区切りを始めた時刻。
    this.checking = null;
    // 前の絵を出したまま、<style> 要素の確かめを待っている今の中身 { text, unchecked }（unchecked: タイルに分けないと書けない）。
    this.deferred = null;
  }

  // 準備の見張りに加えて、<style> 要素の確かめの区切りから戻っていないか。
  get watched() {
    return super.watched || this.slice !== null;
  }

  // 中身 content が <style> 要素を持つか。確かめていなければ null。
  styledOf(content) {
    return this.checked?.content === content ? this.checked.styled : null;
  }

  // 今の中身の <style> 要素を確かめる要があるか（ほかの準備や書き込みが無いときだけ）。
  get styleWanted() {
    if (this.deferred) return !this.job && this.mode === "formatted" && this.deferred.text === this.text;
    const shown = this.shown;
    if (this.job || this.mode !== "formatted" || !shown || shown.fallback || shown.text !== this.text) return false;
    if (this.styledOf(this.text) !== null) return false;
    const part = shown.parts[0];
    if (part.unchecked) return true;
    return part.layout?.styled === null && this.look !== null && svgStyleWanted(part.layout, this.look);
  }

  get needsRun() {
    return super.needsRun || this.styleWanted;
  }

  // 中身が変わったら、前の中身の確かめを忘れる（中身は読むたびに別のものになり、前の中身はもう聞かれない。前の 6 MB の全文を持ち続けない）。
  change(text) {
    if (text !== this.text) this.checked = this.checking = this.deferred = null;
    super.change(text);
  }

  // 前の絵を確かめを待って出している中身は、描画のたびに準備し直さない（確かめ終えたら checkedAs が準備する）。
  sync(text) {
    if (this.deferred?.text === text && text === this.text && !this.interrupted) return;
    super.sync(text);
  }

  // 準備を終えて書く段に入った中身が <style> 要素の確かめを要し、書いた絵を出している（前の中身の）なら、書かずに確かめを待つ。
  // 前の中身の準備の間にまた変わっていたら（pending）、その中身を準備する。
  settle(job) {
    if (!job.restyle && this.waitsForCheck(job)) {
      this.job = null;
      const next = this.pending;
      this.pending = null;
      if (next !== null && next !== job.text) this.begin(next, false);
      else this.deferred = { text: job.text, unchecked: Boolean(job.parts[0].unchecked) };
      return;
    }
    super.settle(job);
  }

  // 前の絵を出したまま確かめを待っている間に見た目が変わったら、前の中身は書き直さず（前の絵を前の大きさのまま出す）、今の中身を
  // 新しい見た目で準備し直す。新しい見た目でも確かめが要れば settle でまた待ち（確かめの続きは checking に残る）、要らなければ
  // 確かめを終えるのを待たずに書く（仕様の、確かめはタイルに分けて書きたい大きさになったときだけ）。
  setLook(look) {
    if (this.deferred && !this.job && this.look?.key !== look.key) {
      this.look = look;
      this.deferred = null;
      this.begin(this.text, false);
      return;
    }
    super.setLook(look);
  }

  waitsForCheck(job) {
    const shown = this.shown;
    if (!shown || shown.fallback || !shown.files.some(Boolean) || shown.text === job.text) return false;
    const part = job.parts[0];
    if (part?.unchecked) return true;
    return part?.layout?.styled === null && this.look !== null && svgStyleWanted(part.layout, this.look);
  }

  tick(budget, now) {
    if (this.job || !this.styleWanted) return super.tick(budget, now);
    if (this.checking?.content !== this.text) this.checking = { content: this.text, scanner: styleScanner(this.text.text), elapsed: 0, last: null };
    const check = this.checking;
    const begun = now();
    check.last = begun;
    this.slice = check;
    check.scanner.step();
    const ended = now();
    this.slice = null;
    check.elapsed += ended - begun;
    if (check.scanner.done) this.checkedAs(check.scanner.found);
    else if (check.elapsed > this.timeLimit) this.timedOut();
    return true;
  }

  // 確かめの区切りから戻らない非同期処理の見張り（MarkdownState の watch と同じ決まり）。止まった確かめが今の確かめなら、区切りを
  // 始めてから気づくまでを表示している間だけ数え、上限を超えていれば打ち切り（timedOut）、超えていなければ確かめを始めから
  // やり直す（止まった区切りの途中までの読み位置を使わない）。ほかは準備の見張り（slice の印が scanner を持たない準備の job か、印が無い）。
  watch(now, visible) {
    const check = this.slice;
    if (this.interrupted || !check?.scanner) return super.watch(now, visible);
    this.slice = null;
    if (check !== this.checking) return true;
    if (visible) this.count(check, now());
    if (check.elapsed > this.timeLimit) this.timedOut();
    else check.scanner = styleScanner(check.content.text);
    return true;
  }

  // 確かめを 10 秒で打ち切った。確かめている中身がタイルに分けなければ描けない SVG（unchecked）なら、打ち切りを理由に失敗にする:
  // 開くとき（確かめ終えるまで読み込み中）は、開くときの打ち切りと同じ開けない案内（出している部分は絵を持たないので代わりの
  // 整形表示になり、svgFileView が打ち切りの理由を出す）。前の絵を出したまま確かめていたとき（deferred）は、前の絵のまま知らせる
  // （fail の keepShown）。タイルに分けない 1 枚で描けるなら、<style> 要素を持つとみなす（タイルに分けない側に倒す）。
  timedOut() {
    const unchecked = this.deferred ? this.deferred.unchecked : this.shown?.parts[0]?.unchecked;
    if (!unchecked) {
      this.checkedAs(true);
      return;
    }
    const { content } = this.checking;
    this.checking = this.deferred = null;
    this.fail(content, { kind: "timeout" });
  }

  // 確かめている中身の <style> 要素の有無が決まった。その有無で今の中身を準備し直す。
  checkedAs(styled) {
    const { content } = this.checking;
    this.checking = this.deferred = null;
    this.checked = { content, styled };
    this.begin(content, false);
  }

  display() {
    const d = super.display();
    // 準備している中身が今の中身より前のもの（準備の間にまた変わり、続けて今の中身を準備する）でも同じ。
    const preparing = this.job !== null && !this.job.restyle && this.shown?.text !== this.text;
    if (preparing && (d.kind === "fallback" || (d.kind === "previous" && d.parts[0]?.error))) return { kind: "loading", notices: [] };
    return d;
  }
}

// fileOf: SVG の部分を見た目で書き出すファイル（lib/diagram-files.js の diagramFile）。preloadWait・timeLimit は MarkdownState と同じ。
export function svgFileState({ fileOf, timeLimit, preloadWait = 0 } = {}) {
  return new SvgFileState({ judge: OUTSIDE, fileOf, preloadWait, keepShown: true, ...(timeLimit ? { timeLimit } : {}) });
}

// MarkdownState の display() を、image viewer の SVG の出し方にする。
// { kind: "loading" | "picture" | "error" | "asis", part?, message?, notices }。picture の part は書いた絵を file に持つ。asis は、
// 書かれた大きさが決められず、元のままのコピーで出す SVG（main.js が中身を読んだときに分けるので、ふつうは来ない）。
// 開くときの失敗（絵の席に書けない、打ち切り）と app が描けない SVG は error（開けない案内の、読み込みの失敗の理由）。
// notices は知らせるだけのもの（倍率を変えたときと中身が変わったときの書き直しの失敗。前の絵のまま出す）。
export function svgFileView(display) {
  if (display.kind === "preparing" || display.kind === "loading") return { kind: "loading", notices: display.notices };
  if (display.kind === "fallback") return { kind: "error", message: reason(display.notices[0]), notices: [] };
  const part = display.parts[0];
  if (part.error) return { kind: "error", message: part.error.message, notices: [] };
  if (part.unchecked) return { kind: "loading", notices: display.notices };
  if (part.asis) return { kind: "asis", notices: [] };
  return { kind: "picture", part, notices: display.notices };
}

function reason(failure) {
  if (failure?.kind === "timeout") return "10 秒たっても読み込みが終わらなかった";
  return `絵を書けなかった（${failure?.message ?? ""}）`;
}

// SVG を書く見た目（.mmd の mmdLook と同じ形）: 倍率か、枠に収める倍率（上限は zoom.fitMax）。枠がまだ測れなければ viewport（窓の
// 描ける大きさ）で見積もる。SVG は色に関わらないので、色は決まった値（null）。zoom: image viewer のズーム（views/zoom.js の Zoom）。
// 倍率が書かれた大きさ layout の上限（書く面積とタイルの数が上限に収まる倍率。maxSvgScale）を超えていれば（中身が変わって書かれた
// 大きさが大きくなった）、zoom の倍率を上限に下げる。縦横の比が極端で書けない layout（開けない案内を出す）では下げない（次に中身が
// 書ける SVG に替わったとき、倍率がごく小さいまま残らないように）。<style> 要素をまだ確かめていない layout（styled が null）では、
// タイルに分けられる上限までにする（確かめるまで書くのはタイルに分けない大きさまでだが、確かめて無いと分かったら、選んだ倍率で書く）。
export function svgLook(zoom, layout, viewport) {
  if (!zoom.fit) {
    const limit = { ...layout, styled: layout.styled === true };
    if (svgDrawable(limit)) zoom.scale = Math.min(zoom.scale, maxSvgScale(limit));
    return scaleLook(null, zoom.scale);
  }
  const view = zoom.view ?? viewport;
  return fitLook(null, { width: view.width, height: view.height, max: zoom.fitMax });
}

// 書き直した SVG の鍵の元（部分の source）: machine・パス・大きさ・更新時刻と中身のハッシュ。lib/diagram-files.js の diagramFile が
// 書く大きさとタイルの位置を足して、絵の席の鍵にする。図の鍵（図のソース）とも画像の鍵（lib/seats.js の imageKey）とも混ざらない
// よう、先頭に NUL と svg を入れる。中身の全文は入れない（6 MB の文字列を表に置かない）。ハッシュを入れるので、大きさと更新時刻が
// 同じまま中身だけ変わった SVG は、前の中身の絵の席を共有しない。
export function svgSource({ machine, path, size, mtime, hash }) {
  return `\u0000svg\n${machine ?? ""}\n${path}\n${size}\n${mtime}\n${hash}`;
}
