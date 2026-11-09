// file-viewer: 1 つのタブに 1 つのファイルを、内容に合った viewer で表示・編集する。
// タブは tab.new {mod: "file-viewer", props: {token, path, machine, preview, index}} で開かれる。
import { View, div, image } from "gpui-kit";
import { randomUUID } from "crypto";
import { v_flex, h_flex, Editor, EditorState, SliderState } from "gpui-base";
import { spaces, props, theme, settings, run, notify, openOverlay, closeOverlay } from "herdr";
import { kind, languageFor } from "./lib/kind.js";
import { formatSize, formatSizes, limitMessage } from "./lib/size.js";
import { tabTitles } from "./lib/tabs.js";
import { splitBom, contentToSave, looksNonUtf8 } from "./lib/save.js";
import { draftsFor, expiredDrafts, restoredDraft, offersDrafts } from "./lib/drafts.js";
import { resolveLink } from "./lib/markdown.js";
import { externalNoticeAction, showsDraftChanged } from "./lib/notices.js";
import { reloadOutcome, carryOver } from "./lib/reload.js";
import { normalizePath } from "./lib/path.js";
import { imageSize } from "./lib/image.js";
import { layoutMermaid } from "./lib/prepare.js";
import { MarkdownState } from "./lib/markdown-state.js";
import { diagramFile, bodyLook, scaleLook, fitLook, colorsKey, svgOwner, maxDiagramScale, tileView } from "./lib/diagram-files.js";
import { diagramFileState, diagramFileView } from "./lib/mmd.js";
import { diagramSvg, diagramColors, resizeSvg } from "./lib/mermaid/svg.js";
import { ZoomSvg, DiagramOpening } from "./lib/zoom-svg.js";
import { OverlayLayout } from "./lib/overlay-layout.js";
import { record, putRecord, viewerTabsIn, findOwnPane, pruneRecords, openTokens, openFile } from "./registry.js";
import { readText, checkChanged, checkUtf8, statOf, pathKind, writeText, WriteConflict, listDrafts, writeDraft, deleteDraft, draftName, copyImage, removeCache, listCache, writeCacheText, cacheExists, CACHE_DIR, pauseForApp } from "./io.js";
import { markdownBody, markdownWaiting, waitingLabel, preloadImages, diagramImage, bodyWidth, diagramError, BAR_MAX, BAR_INSET, BAR_WIDTH } from "./views/markdown.js";
import { BodyScroll, BarShow, measuredParts } from "./lib/body-scroll.js";
import { imageBody, imageInfo } from "./views/image.js";
import { Zoom, zoomTools, zoomArea } from "./views/zoom.js";

const POLL_MS = 2000;
const DRAFT_MS = 3000;
// 描画の外の整形の準備の 1 区間（仕様の「整形の準備」。ガイドの「長い同期処理」の 0.5 秒より十分短く）。
const PREPARE_SLICE_MS = 100;
// 図の拡大の窓の大きさ（タブの窓に対する割合）。
const OVERLAY_WIDTH = 0.92, OVERLAY_HEIGHT = 0.9;
// 図の絵の SVG の名前（大きな絵はタイルごと）。
const tileNames = (f) => (f.tiles ?? [f]).map((t) => t.name);
// 図の拡大（拡大の窓・.mmd）の倍率の上限: 書き出す絵の面積の上限に収まる倍率（lib/diagram-files.js）。
const diagramZoom = (options = {}) => new Zoom({ ...options, maxScale: (width, height) => maxDiagramScale({ width, height }) });
// 図の拡大の窓で、配置が止まっていないかを見る間隔。
const OVERLAY_WATCH_MS = 1000;
// 整形表示の部品が中身を描くのを待つ上限（何も描かない部分は高さが来ないので）。縮んでから数える（lib/body-scroll.js）。
const BODY_WAIT_MS = 1500;
// 整形表示のスクロールバーを、スクロールしてから出しておく時間（app のスクロールバーに合わせる。ガイドの「制約」の「スクロールバー」）。
const BAR_KEEP_MS = 2000;
// 文字を選びながら本文の上下の端の帯（この高さ）に来たら、本文をスクロールし続ける。速さは帯の外側ほど速い（px / 秒）。
const DRAG_EDGE = 32, DRAG_SPEED_MIN = 200, DRAG_SPEED_MAX = 1500;

function syntaxColors(t) {
  return { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 };
}

const themeKey = (t) => `${t.background}|${t.foreground}|${t.ansi5}`;
const fileKey = (machine, path) => `${machine ?? null}\n${path}`;
const message = (e) => String(e?.message ?? e);
// 拡大の窓が書く SVG の名前に付ける、窓ごとの印。
const windowMark = () => `z${Math.random().toString(36).slice(2, 8)}`;

// 配置の大きさの SVG の文字列 text から、図の絵を書く（大きな絵はタイルごとに、同じ絵の viewBox の切れ端）。
// skipExisting: もうあるタイルは書かない。
async function writeTiles(text, file, layout, { skipExisting = false } = {}) {
  for (const t of file.tiles) {
    if (skipExisting && (await cacheExists(t.name))) continue;
    await writeCacheText(t.name, resizeSvg(text, { width: t.width, height: t.height, view: tileView(file, t, layout) }));
  }
}
const pad = (n) => String(n).padStart(2, "0");
function when(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 整形表示の知らせ（lib/markdown-state.js の display().notices の 1 つ）の文言。
function markdownNotice(n) {
  if (n.kind === "over" && n.by === "bytes") {
    const [limit, size] = formatSizes(n.limit, n.size);
    return `大きすぎるので整形表示をせず、ソース表示で開いている（整形表示の上限 ${limit}、今の内容 ${size}）`;
  }
  if (n.kind === "over") return `図が多すぎるので整形表示をせず、ソース表示で開いている（整形表示の上限 図 ${n.limit} 個、今の内容 図 ${n.size} 個）`;
  if (n.kind === "image") return `画像を押せる名前にできなかったので、画像と図をそのまま表示している（${n.message}）`;
  if (n.kind === "write") return `図を書き出せなかったので、画像と図をそのまま表示している（${n.message}）`;
  if (n.kind === "restyle-write") return `図を書き出せなかったので、図は前の色や大きさのまま表示している（${n.message}）`;
  if (n.kind === "restyle-timeout") return "整形の準備が終わらなかったので、図は前の色や大きさのまま表示している";
  return "整形の準備が終わらなかったので、画像と図をそのまま表示している";
}

function button(id, label, t, onClick, active = false) {
  return div().id(id).h(24).px(8).flex_none().items_center().justify_center().rounded(6).cursor_pointer().text_size(12)
    .text_color(active ? t.foreground : t.muted).when(active, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)).child(label);
}

export default class FileViewer extends View {
  init(_props, cx) {
    const p = props() ?? {};
    // 図の拡大表示（タブの上に重ねる窓）として開かれたコピー。
    if (p.mermaid !== undefined) {
      // 開いたタブのコピーが書いた SVG（svg: 配置の大きさの SVG の文字列、shown: 開いたときに出す絵）を受け取り、倍率が変わったら
      // width と height だけを替えて書き直す（lib/zoom-svg.js）。テーマが変わったら、図を描画の外で配置し直して新しい色で書く
      // （layout: lib/overlay-layout.js）。書いた SVG の名前は、タブの token に窓の印（mark）を付けたもの。
      const colors = p.colors ?? diagramColors(theme());
      this.overlay = {
        source: p.mermaid, firstLine: p.firstLine ?? 1, token: p.token ?? "fv-overlay", mark: p.mark ?? "z0",
        size: { width: p.layoutWidth ?? 1, height: p.layoutHeight ?? 1 },
        zoom: diagramZoom({ fitMax: 3 }), layout: null, running: null,
        colors: { [colorsKey(colors)]: colors }, svgs: { [colorsKey(colors)]: p.svg ?? null },
        zs: p.shown ? new ZoomSvg({ shown: p.shown, colorsKey: colorsKey(colors) }) : null,
      };
      cx.timer.every(OVERLAY_WATCH_MS, (cx) => this.watchOverlay(cx));
      return;
    }
    this.token = p.token ?? null;
    // init の時点の spaces() はまだ開く前の状態で、各 space で選ばれていたタブを指す。
    // props に位置が無いとき（CLI から開いたときなど）は、そのタブの右に置く。
    this.activeBefore = Object.fromEntries(spaces().map((s) => [s.id, s.tabs.find((t) => t.active)?.id ?? null]));
    this.pane = null;
    this.me = null;
    this.file = null;
    this.loadedKey = null;
    this.wrap = false;
    this.pendingTitle = null;
    this.mdBox = {};
    // 整形表示の本文のスクロールの位置（lib/body-scroll.js）と、スクロールバーのつまみ。開いた中身ごとに位置を始めから数える。
    this.mdScroll = new BodyScroll();
    this.bar = SliderState.new({ min: 0, max: BAR_MAX, step: 1, value: BAR_MAX });
    this.bar.on("change", (v, cx) => {
      // syncBar が合わせた値が返ってきただけなら、スクロールしたことにしない（スクロールバーを出さない）。
      const echo = this.barSet !== null && Math.abs(Number(v) - this.barSet) <= 1;
      if (this.mdScroll.moveToFraction(1 - v / BAR_MAX)) { if (!echo) this.showBar(cx); cx.notify(); }
    });
    // スクロールバーを出しているか（BarShow）と、出す時間が過ぎたら描き直すタイマー（無ければ null）。
    this.barShow = new BarShow(BAR_KEEP_MS);
    // syncBar がつまみに最後に合わせた値（まだなら null）。
    this.barSet = null;
    this.barTimer = null;
    // 本文の中のドラッグ（文字の選択）。pressed: 左ボタンを本文の中で押している。dir: 上下の端の帯にいれば -1（上）/ 1（下）。
    // depth: 帯の中の深さ（0〜1）。running: スクロールし続ける非同期処理が動いている。
    this.selDrag = { pressed: false, dir: 0, depth: 0, running: false };
    // 前の描画で本文の場所に出したもの（"formatted" | "source" | "preparing" | "loading" | null）と、本文の部品が中身を描くまで
    // 上に重ねる前の表示（同じ値の 1 つか null）。
    this.bodyShown = null;
    this.mdCover = null;
    // 本文の部品が中身を描くのを見ている mdScroll（見ていなければ null。watchBody）。
    this.bodyWatch = null;
    // Markdown の整形表示の見え方（lib/markdown-state.js）。開いた中身ごとに作り、外部変更の読み直しや下書きの復元では残す
    // （this.file は読み直しで入れ替わるので、そこには置かない）。
    this.md = null;
    // 描画の外の準備を動かしている非同期処理の印（runPreparation が作る。動かしていなければ null）。
    this.preparing = null;
    // 拡大の窓を本文の絵で開いたときに、窓に貸した本文の SVG の名前（窓が出している間は消さない）。タブは窓が閉じたことを
    // 知れないので、次に窓を開くまで（窓は 1 つずつなので、そのときには前の窓は閉じている）か、タブを閉じるまで覚える。
    this.lent = null;
    this.focus = cx.focus_handle();
    cx.timer.every(POLL_MS, (cx) => {
      this.watchPreparation(cx);
      this.poll(cx);
    });
    // 表示していないタブでも動き続けるので、閉じるときに呼ばれない場合（裏のタブを閉じた、強制終了）も
    // 数秒前までの編集が下書きに残る。
    cx.timer.every(DRAFT_MS, (cx) => this.keepDraft(cx));
  }

  // 閉じるとき（アプリの終了を含む）は、未保存の編集を下書きに書く。止める手段は無いので確認は出さない。
  // 図の拡大の窓は、自分が書いた SVG（窓の印の付いたもの）を消す。
  async close() {
    const o = this.overlay;
    if (o) {
      for (const name of await listCache()) {
        const owner = svgOwner(name);
        if (owner?.token === o.token && owner.mark === o.mark) await removeCache(`${CACHE_DIR}/${name}`);
      }
      return;
    }
    const file = this.file;
    if (file?.dirty && file.editor) await writeDraft(this.draftOf(file)).catch(() => {});
    // 閉じたタブの画像のコピーと図の SVG（拡大の窓が書いたものも）は消す（アプリの終了でも消えるが、次に開いたときに書き直す）。
    await removeCache(file?.cache);
    for (const name of await listCache()) if (svgOwner(name)?.token === this.token) await removeCache(`${CACHE_DIR}/${name}`);
    file?.editor?.release();
  }

  // 自分のペイン・タブ・space。名乗れていなければ null。
  identify() {
    if (!this.token) return null;
    const own = findOwnPane(this.token);
    if (!own) return null;
    const space = spaces().find((s) => s.tabs.some((t) => t.id === own.tab));
    if (!space) return null;
    return { pane: own.pane, tab: own.tab, space, tabInfo: space.tabs.find((t) => t.id === own.tab) };
  }

  // 表示中: そのタブの space が表示中で、そのタブが space の中で選ばれている。
  visible() {
    return Boolean(this.me?.space.active && this.me.tabInfo?.active);
  }

  // 初めて名乗ったとき: 記録を作り（または更新し）、開いたときに選ばれていたタブの右に移る。
  claim(me, cx) {
    const p = props() ?? {};
    const rec = record(this.token);
    const first = !rec || !rec.pane;
    putRecord(this.token, {
      pane: me.pane, space: me.space.id,
      machine: rec?.machine !== undefined ? rec.machine : (p.machine ?? null),
      path: rec?.path ?? (p.path ? normalizePath(p.path) : null),
      preview: rec ? Boolean(rec.preview) : Boolean(p.preview),
      mode: rec?.mode ?? null, dirty: Boolean(rec?.dirty), createdAt: rec?.createdAt ?? Date.now(),
    });
    const started = !this.pane;
    this.pane = me.pane;
    if (first) {
      let index = rec?.index ?? p.index;
      const before = me.space.tabs.find((t) => t.id === this.activeBefore[me.space.id] && t.id !== me.tab);
      if (!index && before) index = before.index + 1;
      if (index && index !== me.tabInfo.index) run("tab.move", { id: me.tab, index });
    }
    if (started) {
      pruneRecords();
      cx.spawn(async () => {
        for (const d of expiredDrafts(await listDrafts(), Date.now())) await deleteDraft(d.name);
        await this.sweepCaches();
      });
    }
    cx.notify();
  }

  // ---- 読み込み ----

  load(target, cx) {
    this.loadedKey = fileKey(target.machine, target.path);
    // 同じファイルを開き直すこと（A → B → A）もあるので、どの読み込みかは鍵ではなく回数で見分ける。
    const gen = this.loads = (this.loads ?? 0) + 1;
    this.md = null;
    this.preparing = null;
    this.mdScroll = new BodyScroll();
    this.file?.editor?.release();
    const old = this.file?.cache;
    this.file = { path: target.path, machine: target.machine ?? null, loading: true };
    if (old) cx.spawn(async () => removeCache(old));
    cx.spawn(async (cx) => {
      const file = await this.read(target.path, target.machine ?? null);
      if (this.loads !== gen) { file.editor?.release(); return; }
      this.file = file;
      this.setDirty(false);
      cx.notify();
      // 前に開いていたファイルの画像のコピーと図の SVG を消す（Markdown の図は、整形表示の差し替えのあとに消す）。
      if (file.cache) await this.dropOtherCaches(file.cache);
      else if (file.view?.type !== "markdown") await this.dropOtherCaches(null);
      await this.offerDrafts(file);
      cx.notify();
    });
  }

  async read(path, machine) {
    const file = { path, machine, loading: false };
    try {
      if (kind({ path, size: 0 }).type === "image") return await this.readImage(file);
      const r = await readText(path, machine);
      if (!r.exists) {
        file.missing = true;
        file.view = { type: "unopenable", reason: "missing" };
        return file;
      }
      file.size = r.size;
      file.view = kind({ path, size: r.size, text: r.text });
      if (file.view.type === "unopenable") { await this.sign(file); return file; }
      this.takeText(file, r.text, await this.notUtf8(r.text, path, machine));
      file.base = r.base;
    } catch (e) {
      file.view = { type: "unopenable", reason: "error", message: message(e) };
      if (e?.size !== undefined) file.size = e.size;
    }
    return file;
  }

  // 開けないファイルの案内のタブは基準（内容のハッシュ）を持たないので、大きさと更新時刻で変化を見る。
  async sign(file) {
    file.sig = await statOf(file.path, file.machine).catch(() => null);
  }

  // 画像は app home にコピーして表示する。SVG はソースも読んで Editor に入れる（1 MiB まで）。
  async readImage(file) {
    const r = await copyImage(file.path, file.machine, this.token);
    if (!r.exists) {
      file.missing = true;
      file.view = { type: "unopenable", reason: "missing" };
      return file;
    }
    file.size = r.size;
    file.view = kind({ path: file.path, size: r.size });
    if (file.view.type === "unopenable") { await this.sign(file); return file; }
    file.cache = r.cache;
    file.base = r.base;
    file.zoom = new Zoom();
    if (file.view.source) {
      const text = await readText(file.path, file.machine);
      if (text.text !== undefined) {
        this.takeText(file, text.text, await this.notUtf8(text.text, file.path, file.machine));
        file.base = text.base;
      }
    }
    file.dims = file.text !== undefined ? imageSize({ svg: file.text })
      : /svg$/i.test(file.path) ? imageSize({ svg: String.fromCharCode(...r.header.slice(0, 4096)) })
      : imageSize({ bytes: r.header });
    return file;
  }

  // どの viewer のタブも使っていない画像のコピーを消す。表示していないタブを閉じたときは close() が
  // 呼ばれないので、動き出したときに加えて、ときどきこれで消す。
  async sweepCaches() {
    const open = openTokens();
    for (const name of await listCache()) {
      const owner = svgOwner(name)?.token;
      if (!owner || !open.has(owner)) await removeCache(`${CACHE_DIR}/${name}`);
    }
  }

  // 同じタブの古い画像のコピー（内容が変わる前のもの）を消す。読み込んだ file を採った後に呼ぶ
  // （捨てるかもしれない読み込みの途中で呼ぶと、表示中のコピーを消してしまう）。拡大の窓が書いたものは、窓が消す。
  // 拡大の窓に貸している本文の絵も消さない。
  async dropOtherCaches(keep) {
    for (const name of await listCache()) {
      const path = `${CACHE_DIR}/${name}`;
      const owner = svgOwner(name);
      if (path !== keep && owner?.token === this.token && !owner.mark && !this.lent?.has(name)) await removeCache(path);
    }
  }

  // 整形表示の中で使わなくなった図の SVG（差し替えの前の絵、前の色や大きさの絵）を消す。拡大の窓が書いたものと、拡大の窓に
  // 貸している本文の絵は消さない。
  async dropUnusedSvgs(md) {
    for (const name of await listCache()) {
      const owner = svgOwner(name);
      if (owner?.token !== this.token || owner.mark || !name.endsWith(".svg")) continue;
      if (this.md !== md || md.keep().has(name) || this.lent?.has(name)) continue;
      await removeCache(`${CACHE_DIR}/${name}`);
      md.lost([name]);
    }
  }

  // 出している図の SVG があるかを確かめ、無くなっていれば書き直させる（整形表示に入るときと、表示に戻ったとき）。
  checkSvgs(cx) {
    const md = this.md;
    const files = (md?.shown?.files ?? []).filter(Boolean);
    if (!files.length) return;
    cx.spawn(async (cx) => {
      const missing = [];
      for (const name of files.flatMap(tileNames)) if (!(await cacheExists(name))) missing.push(name);
      if (!missing.length || this.md !== md) return;
      md.lost(missing);
      cx.notify();
    });
  }

  // UTF-8 でない（読み取り専用にする）か。読んだ内容に U+FFFD があるときだけファイルのバイト列を確かめ、
  // 正しい UTF-8 なら U+FFFD を文字として含むファイルとして編集させる。確かめられなければ読み取り専用。
  async notUtf8(raw, path, machine) {
    if (!looksNonUtf8(raw)) return false;
    return (await checkUtf8(path, machine).catch(() => null)) !== true;
  }

  // 読んだテキストを file に入れる。先頭の BOM は外して有無だけを記録し、Editor にも「読んだときの内容」
  // （file.text、改行を書き戻す基準）にも BOM 抜きの本文を持つ。
  takeText(file, raw, readonly) {
    const { bom, text } = splitBom(raw);
    file.bom = bom;
    file.text = text;
    file.readonly = readonly;
    this.attachEditor(file, text);
  }

  // Editor を作り、編集の検知をつなぐ。shown は「未編集の内容」。Editor は渡した改行と末尾の改行を
  // そのまま返す（ガイドの「制約」の EditorState）が、編集の有無は Editor から読み戻した値と比べる。
  attachEditor(file, value) {
    const t = theme();
    this.themeKey = themeKey(t);
    const editor = EditorState.new({
      language: languageFor(file.path), value, readonly: Boolean(file.readonly), soft_wrap: this.wrap,
      font_family: settings().font_family, font_size: 13, syntax: syntaxColors(t),
    });
    file.editor = editor;
    file.shown = editor.value();
    editor.on("change", (_e, cx) => {
      if (this.file !== file || file.editor !== editor) return;
      this.setDirty(editor.value() !== file.shown);
      cx.notify();
    });
  }

  // 折り返しやテーマを変えるときは、内容を引き継いで Editor を作り直す（後から変える API が無い）。
  rebuildEditor(cx) {
    const file = this.file;
    if (!file?.editor) return;
    const value = file.editor.value(), shown = file.shown;
    file.editor.release();
    this.attachEditor(file, value);
    file.shown = shown;
    cx.notify();
  }

  // 未保存の編集の有無を記録する。編集したプレビュータブは固定タブになる。
  setDirty(dirty) {
    if (this.file) this.file.dirty = dirty;
    const rec = record(this.token);
    if (!rec) return;
    if (Boolean(rec.dirty) === dirty && !(dirty && rec.preview)) return;
    putRecord(this.token, dirty ? { dirty, preview: false } : { dirty });
  }

  // ディスクの内容で読み直す（未保存の編集は捨てる）。wasMissing は、確認で戻ってきたと分かる前に無かったか。
  reload(cx, wasMissing) {
    const file = this.file;
    if (!file) return;
    const missing = wasMissing ?? file.missing;
    const key = this.loadedKey;
    const before = file.editor?.value();
    cx.spawn(async (cx) => {
      const next = await this.read(file.path, file.machine);
      if (this.loadedKey !== key || this.file !== file) { next.editor?.release(); return; }
      const outcome = reloadOutcome({
        editor: Boolean(file.editor), image: Boolean(file.cache), edited: Boolean(file.editor) && file.editor.value() !== before, missing: Boolean(next.missing),
      });
      // 読み直したらファイルが無かった: 表示していた中身（テキストも画像も）と未保存の編集（と下書き）を残し、「ファイルが無くなった」にする。
      if (outcome === "missing") {
        next.editor?.release();
        file.missing = true;
        file.external = null;
        cx.notify();
        return;
      }
      // 読み込みの間に打った文字は捨てない。読み直さずに、ディスクが変わったことを知らせる。
      if (outcome === "keep-edits") {
        next.editor?.release();
        if (next.base) this.considerExternal(file, { changed: next.base.hash !== file.base?.hash, diskHash: next.base.hash, dirty: true });
        cx.notify();
        // 表示中の画像は今の file のコピーを使い続けるので、捨てる読み直しのコピーだけを消す。
        if (next.cache && next.cache !== file.cache) await removeCache(next.cache);
        return;
      }
      file.editor?.release();
      carryOver(file, next);
      this.file = next;
      this.setDirty(false);
      cx.notify();
      // 捨てた編集の下書きも消す（新しい file は下書きを持っていないので、keepDraft では消えない）。
      if (file.dirty || file.drafted !== undefined) await deleteDraft(this.draftNameOf(file));
      // 無くなっていたファイルが戻ってきたら、そのファイルの下書きをもう一度聞く。
      if (missing && !next.missing) { await this.offerDrafts(next); cx.notify(); }
      if (next.cache) await this.dropOtherCaches(next.cache);
    });
  }

  // ---- 下書き ----

  // 今の編集の下書きの名前。読み込んだ file ごとに印を付け、復元を聞いている自分の token の下書き
  // （再起動の前の編集など）と別のファイルにする。同じ名前だと、答える前の編集がそれを上書きし、
  // 保存や「破棄」で両方が消える。
  draftNameOf(file) {
    file.draftName ??= draftName(this.token, file.machine, file.path, randomUUID());
    return file.draftName;
  }

  draftOf(file) {
    return {
      name: this.draftNameOf(file),
      token: this.token, machine: file.machine, path: file.path,
      content: file.editor.value(), bom: Boolean(file.bom), base: file.base ?? null, updatedAt: Date.now(),
    };
  }

  // 編集している間、3 秒ごとに下書きを更新する。編集が無くなったら自分の下書きを消す。
  keepDraft(cx) {
    this.ticks = (this.ticks ?? 0) + 1;
    if (this.ticks % 10 === 0 && this.pane && this.visible()) cx.spawn(async () => this.sweepCaches());
    const file = this.file;
    if (!file?.editor || file.loading) return;
    if (file.dirty) {
      const content = file.editor.value();
      if (content === file.drafted) return;
      file.drafted = content;
      cx.spawn(async () => { await writeDraft(this.draftOf(file)).catch(() => { file.drafted = null; }); });
    } else if (file.drafted !== undefined) {
      file.drafted = undefined;
      cx.spawn(async () => deleteDraft(this.draftNameOf(file)));
    }
  }

  // 開いたファイルに、開いているほかの viewer のタブのものでない下書きがあれば「復元 / 破棄」を聞く。
  // ファイルが無いとき（無くなった後の再起動など）も、そのファイルの下書きがあれば聞く。
  async offerDrafts(file) {
    if (!offersDrafts(file)) return;
    const list = draftsFor({ drafts: await listDrafts(), machine: file.machine, path: file.path, openTokens: openTokens(), selfToken: this.token });
    if (this.file !== file || !list.length) return;
    file.drafts = list;
  }

  restoreDraft(name, cx) {
    const file = this.file;
    const draft = file?.drafts?.find((d) => d.name === name);
    if (!draft || (!file.editor && !file.missing)) return;
    const { text, bom } = restoredDraft(draft);
    if (!file.editor) {
      // ファイルが無いときは、下書きの内容を入れる Editor を作る。未保存の編集として入れるため空で作る。
      // 改行と末尾の改行・BOM の有無は下書きのものを保つ。SVG は画像のコピーが無いので、ソースとして出す。
      const view = kind({ path: file.path, size: 0, text });
      file.view = view.type === "image" ? { type: "code", source: true } : view;
      file.text = text;
      file.bom = bom;
      this.attachEditor(file, "");
    }
    file.drafts = file.drafts.filter((d) => d !== draft);
    file.editor.set_value(text);
    // 復元は編集として扱う（プレビュータブなら固定タブになる）。保存前の確認の基準は下書きに記録したディスクの状態。
    file.base = draft.base;
    this.setDirty(file.editor.value() !== file.shown);
    file.drafted = null;
    // 復元のあとのディスクの確認が返るまでは、外部変更を知らせない（2 秒ごとの確認と同じ変化を 2 回知らせないため）。
    // 出ていた外部変更の知らせは、復元する前の基準からの変化なので消す。
    file.restoring = true;
    file.external = null;
    cx.spawn(async (cx) => {
      await deleteDraft(draft.name);
      const r = await checkChanged(file.path, file.machine, draft.base).catch(() => null);
      file.restoring = false;
      if (this.file === file && r && (r.missing || r.changed)) {
        // 知らせた変化は、外部変更としては知らせない（そこからさらに変わったら知らせる）。選択を待つ知らせが出ていれば、
        // それを残す（保存前の確認がその変化を示している）。
        if (showsDraftChanged(file.notice?.kind ?? null)) file.notice = { kind: "draft-changed" };
        file.draftNoticed = r.base?.hash ?? null;
      }
      cx.notify();
    });
    cx.notify();
  }

  discardDraft(name, cx) {
    const file = this.file;
    const draft = file?.drafts?.find((d) => d.name === name);
    if (!draft) return;
    file.drafts = file.drafts.filter((d) => d !== draft);
    cx.spawn(async (cx) => { await deleteDraft(draft.name); cx.notify(); });
    cx.notify();
  }

  // ---- 外部変更 ----

  poll(cx) {
    const file = this.file;
    if (!file || file.loading || file.polling || file.saving || !this.visible()) return;
    if (file.view?.type === "unopenable" && file.view.reason !== "missing") { this.pollUnopenable(file, cx); return; }
    if (!file.base && !file.missing) return;
    file.polling = true;
    const key = this.loadedKey, base = file.base;
    cx.spawn(async (cx) => {
      try {
        // 開いたときに無かった画像は基準が無いので、画像として確かめる。
        const r = await checkChanged(file.path, file.machine, base, { bytes: !file.editor && kind({ path: file.path, size: 0 }).type === "image" });
        // 確認の間に保存が始まった・終わったなら、この結果は古い。
        if (this.loadedKey !== key || this.file !== file || file.saving || file.base !== base) return;
        if (r.missing) {
          if (!file.missing) { file.missing = true; cx.notify(); }
          return;
        }
        const back = file.missing;
        file.missing = false;
        if (!r.changed) { if (back) cx.notify(); return; }
        if (this.considerExternal(file, { changed: true, diskHash: r.base.hash }) === "reload") { this.reload(cx, back); return; }
        cx.notify();
      } catch {
        // 一時的な失敗（machine に届かない等）は次の確認で取り直す。
      } finally {
        file.polling = false;
      }
    });
  }

  // 開けないファイルの案内（上限超え・バイナリ・読み込みの失敗）のタブ。変わったか、前回が読み込みの失敗なら読み直す。
  pollUnopenable(file, cx) {
    file.polling = true;
    cx.spawn(async (cx) => {
      try {
        const sig = await statOf(file.path, file.machine);
        if (this.file !== file) return;
        if (file.view.reason === "error" || sig !== file.sig) this.reload(cx);
      } catch {
        // machine に届かない等は次の確認で取り直す。
      } finally {
        file.polling = false;
      }
    });
  }

  // ---- 保存 ----

  onKey(e, cx) {
    const k = e.keystroke;
    if (k === "ctrl-s" || k === "cmd-s") {
      cx.stop_propagation();
      this.save(cx);
    }
  }

  save(cx) {
    const file = this.file;
    if (!file?.editor || file.readonly || file.saving) return;
    if (file.missing) {
      this.openChoice(file, { kind: "recreate" });
      cx.notify();
      return;
    }
    if (!file.dirty) return;
    file.saving = true;
    cx.spawn(async (cx) => {
      try {
        const r = await checkChanged(file.path, file.machine, file.base);
        if (r.missing) { file.missing = true; this.openChoice(file, { kind: "recreate" }); return; }
        if (r.changed) { this.openChoice(file, { kind: "conflict", base: r.base }); return; }
        await this.write(file, file.base);
      } catch (e) {
        file.notice = { kind: "error", text: `保存できなかった: ${message(e)}` };
      } finally {
        file.saving = false;
        cx.notify();
      }
    });
  }

  // base を基準に書く（null ならファイルを作る）。食い違えば確認に戻す。
  // 書いている間（他 machine では exec を何度も往復する）にも編集できるので、書いた内容を基準にし、
  // それより新しい編集は未保存のまま残す。
  async write(file, base) {
    const value = file.editor.value();
    const content = contentToSave({ original: file.text ?? "", edited: value, bom: Boolean(file.bom) });
    try {
      file.base = await writeText(file.path, file.machine, content, base);
    } catch (e) {
      if (!(e instanceof WriteConflict)) throw e;
      if (e.reason === "missing") { file.missing = true; this.openChoice(file, { kind: "recreate" }); }
      else this.openChoice(file, { kind: "conflict", base: null });
      return;
    }
    file.text = splitBom(content).text;
    file.shown = value;
    file.missing = false;
    file.notice = null;
    file.external = null;
    file.dismissed = null;
    file.draftNoticed = null;
    const dirty = file.editor.value() !== value;
    this.setDirty(dirty);
    if (dirty) {
      // 下書きは残し、次の更新で新しい基準のものに書き直す。
      file.drafted = null;
    } else {
      // 保存したら、このタブの下書きは消す。
      file.drafted = undefined;
      await deleteDraft(this.draftNameOf(file));
    }
    // SVG のソースを保存したら、画像表示もコピーし直す。
    if (file.cache) {
      const r = await copyImage(file.path, file.machine, this.token).catch(() => null);
      if (r?.cache && this.file === file) {
        file.cache = r.cache;
        file.dims = imageSize({ svg: file.text }) ?? file.dims;
        await this.dropOtherCaches(r.cache);
      }
    }
  }

  // 外部変更の知らせを、ほかの知らせとの重なりの規則（lib/notices.js）で出す・置き換える・消す。
  // 戻り値が "reload" なら（未編集のタブ）、呼ぶ側が読み直す。
  considerExternal(file, { changed, diskHash, dirty = Boolean(file.dirty) }) {
    const action = externalNoticeAction({
      dirty, changed, diskHash, notice: file.notice?.kind ?? null, external: file.external?.hash ?? null,
      dismissed: file.dismissed ?? null, draftNoticed: file.draftNoticed ?? null, restoring: Boolean(file.restoring),
    });
    if (action === "show" || action === "update") file.external = { hash: diskHash };
    if (action === "hide") file.external = null;
    return action;
  }

  // 選択を待つ知らせ（保存前の確認の 3 択、作り直す確認）を出す。出ていた外部変更の知らせはこれに置き換わる。
  openChoice(file, notice) {
    file.notice = notice;
    this.considerExternal(file, { changed: true, diskHash: notice.base?.hash ?? null, dirty: true });
  }

  // 外部変更の知らせの答え。
  answerExternal(choice, cx) {
    const file = this.file;
    const external = file?.external;
    if (!external) return;
    file.external = null;
    if (choice === "reload") { this.reload(cx); return; }
    // 自分の編集を続ける: 同じ変化はもう知らせない。
    file.dismissed = external.hash;
    cx.notify();
  }

  // 外部変更の知らせ以外の確認の答え。
  answer(choice, cx) {
    const file = this.file;
    const notice = file?.notice;
    if (!notice) return;
    file.notice = null;
    if (choice === "reload") { this.reload(cx); return; }
    if (choice === "cancel" || choice === "close") { cx.notify(); return; }
    // overwrite（今のディスクの内容を基準にして上書き）/ recreate（作り直す）
    file.saving = true;
    cx.spawn(async (cx) => {
      try {
        let base = null;
        if (choice === "overwrite") {
          base = notice.base;
          if (!base) {
            const r = await checkChanged(file.path, file.machine, null);
            if (r.missing) { file.missing = true; this.openChoice(file, { kind: "recreate" }); return; }
            base = r.base;
          }
        }
        await this.write(file, base);
      } catch (e) {
        file.notice = { kind: "error", text: `保存できなかった: ${message(e)}` };
      } finally {
        file.saving = false;
        cx.notify();
      }
    });
  }

  // ---- 表示 ----

  syncTitle(me) {
    const title = tabTitles(viewerTabsIn(me.space.id))[this.token];
    if (!title || title === me.tabInfo.name || title === this.pendingTitle) return;
    this.pendingTitle = title;
    run("tab.rename", { id: me.tab, name: title });
  }

  render(cx) {
    const t = theme();
    if (this.overlay) return this.renderOverlay(t, cx);
    const me = this.identify();
    this.me = me;
    if (me && this.pane !== me.pane && this.claiming !== me.pane) {
      this.claiming = me.pane;
      cx.spawn(async (cx) => this.claim(me, cx));
    }
    const rec = this.token ? record(this.token) : null;
    if (me && rec?.pane === me.pane) {
      const path = rec.path ?? props()?.path ?? null;
      if (path && fileKey(rec.machine, path) !== this.loadedKey) {
        const target = { machine: rec.machine ?? null, path };
        this.loadedKey = fileKey(target.machine, path);
        cx.spawn(async (cx) => this.load(target, cx));
      }
      cx.spawn(async () => this.syncTitle(me));
    }
    if (this.file?.editor && this.themeKey !== themeKey(t) && !this.rebuilding) {
      // spawn の中身は最初の await まで描画の中で動く（ガイドの「cx.spawn の始まり」）。Editor の作り直しと cx.notify() は
      // 描画の中ではできないので、先に区切る。
      this.rebuilding = true;
      cx.spawn(async (cx) => {
        await pauseForApp();
        this.rebuilding = false;
        this.rebuildEditor(cx);
      });
    }
    // 表示に戻ったら、出している図の SVG があるかを確かめる（表示していない間に掃除で消えていれば書き直す）。
    const shownNow = this.visible();
    if (shownNow && !this.wasVisible) this.checkSvgs(cx);
    this.wasVisible = shownNow;
    this.syncMarkdown(rec, t, cx);

    return v_flex().id("fv-root").relative().size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.focus).on_key_down((e, cx) => this.onKey(e, cx))
      .child(this.toolbar(rec, t))
      .children(this.notices(t))
      .child(this.body(rec, t, cx))
      .children(this.preloads());
  }

  toolbar(rec, t) {
    const file = this.file;
    const type = file?.view?.type;
    const source = this.showsSource(rec);
    const md = type === "markdown" ? this.md?.display() : null;
    const isCode = type === "code" || ((type === "markdown" || type === "image" || type === "mermaid") && source && file?.editor);
    const isImage = type === "image" && !source;
    return h_flex().id("fv-toolbar").h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(file?.path ?? ""))
      .when(Boolean(rec?.preview), (el) => el.child(button("fv-pin", "固定", t, (cx) => { putRecord(this.token, { preview: false }); cx.notify(); })))
      .when(isImage, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(imageInfo(file))))
      .when(isImage, (el) => el.child(zoomTools({ id: "fv-zoom", zoom: file.zoom, width: file.dims?.width ?? 512, height: file.dims?.height ?? 512, t })))
      // 整形表示の上限を超えている間は、整形表示に切り替えるボタンを出さない。
      .when(type === "markdown" && (!source || Boolean(md?.formatButton)), (el) => el.child(button("fv-source", source ? "整形表示" : "ソース", t, (cx) => this.toggleSource(cx), source)))
      .when(type === "mermaid" && !source && Boolean(file?.editor), (el) => {
        const l = this.mmdLayout();
        return l && file.zoom ? el.child(zoomTools({ id: "fv-mmd-zoom", zoom: file.zoom, width: l.width, height: l.height, t })) : el;
      })
      .when(type === "mermaid", (el) => el.child(button("fv-source", source ? "図" : "ソース", t, (cx) => this.toggleSource(cx), source)))
      .when(type === "image" && Boolean(file?.view?.source), (el) => el.child(button("fv-source", source ? "画像" : "ソース", t, (cx) => this.toggleSource(cx), source)))
      .when(isCode, (el) => el.child(button("fv-wrap", "折り返し", t, (cx) => { this.wrap = !this.wrap; this.rebuildEditor(cx); }, this.wrap)))
      .when(Boolean(file?.editor && !file.readonly), (el) => el.child(button("fv-save", file.dirty ? "保存 ●" : "保存", t, (cx) => this.save(cx))));
  }

  banner(id, text, t, color, actions = [], onAnswer = (key, cx) => this.answer(key, cx)) {
    return h_flex().id(id).flex_none().px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.raised)
      .child(div().w(3).h(16).flex_none().rounded(2).bg(color))
      .child(div().flex_1().min_w(0).text_size(12).child(text))
      .children(actions.map(([key, label]) => button(`${id}-${key}`, label, t, (cx) => onAnswer(key, cx))));
  }

  notices(t) {
    const file = this.file;
    if (!file || file.loading) return [];
    const out = [];
    if (file.missing && file.view?.type !== "unopenable") out.push(this.banner("fv-missing", "ファイルが無くなった（表示は無くなる前の内容）", t, t.blocked));
    if (file.readonly) out.push(this.banner("fv-encoding", "UTF-8 でない可能性があるため、読み取り専用で開いている（文字化けしている部分がある）", t, t.blocked));
    const n = file.notice;
    // 外部変更の知らせは、知らせるだけのものや「復元 / 破棄」と並べて出す（重なりの規則は considerExternal）。
    if (file.external) out.push(this.banner("fv-external", "ディスクの内容が変わった", t, t.working, [["reload", "ディスクの内容で読み直す"], ["keep", "自分の編集を続ける"]], (key, cx) => this.answerExternal(key, cx)));
    if (n?.kind === "conflict") out.push(this.banner("fv-conflict", "保存の前にディスクの内容が変わっている", t, t.blocked, [["reload", "ディスクの内容で読み直す"], ["overwrite", "自分の内容で上書きする"], ["cancel", "やめる"]]));
    if (n?.kind === "recreate") out.push(this.banner("fv-recreate", "ファイルが無くなっている。今の内容で作り直す？", t, t.blocked, [["recreate", "作り直す"], ["cancel", "やめる"]]));
    if (n?.kind === "error") out.push(this.banner("fv-error", n.text, t, t.blocked, [["close", "閉じる"]]));
    if (n?.kind === "draft-changed") out.push(this.banner("fv-draft-changed", "下書きの後にディスクが変わっている（保存するときに確かめる）", t, t.working, [["close", "閉じる"]]));
    // 整形表示の知らせ（知らせるだけのもの。閉じられない）。
    const shownNotices = !this.md ? [] : file.view?.type === "markdown" ? this.md.display().notices
      : file.view?.type === "mermaid" && this.md.display().kind !== "source" ? diagramFileView(this.md.display()).notices : [];
    for (const [i, m] of shownNotices.entries()) {
      out.push(this.banner(`fv-md-notice-${i}`, markdownNotice(m), t, m.kind === "over" ? t.working : t.blocked));
    }
    for (const [i, d] of (file.drafts ?? []).entries()) {
      out.push(h_flex().id(`fv-draft-${i}`).flex_none().px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.raised)
        .child(div().w(3).h(16).flex_none().rounded(2).bg(t.accent))
        .child(div().flex_1().min_w(0).text_size(12).child(`未保存の編集の下書きがある（${when(d.updatedAt)}）`))
        .child(button(`fv-draft-${i}-restore`, "復元", t, (cx) => this.restoreDraft(d.name, cx)))
        .child(button(`fv-draft-${i}-discard`, "破棄", t, (cx) => this.discardDraft(d.name, cx))));
    }
    return out;
  }

  // 表示の切り替え（整形 / ソース）はタブごとに記録に持つ。既定は整形表示。Markdown は、整形表示の上限で移した
  // ソース表示も含めて、見え方の決まり（this.md）に従う（記録には利用者が選んだものだけを書く）。
  showsSource(rec) {
    if (this.preparedType() && this.md) return this.md.display().kind === "source";
    return rec?.mode === "source";
  }

  toggleSource(cx) {
    const md = this.preparedType() ? this.md : null;
    if (md) {
      if (md.display().kind === "source") {
        md.enter();
        this.checkSvgs(cx);
      } else md.toSource();
      putRecord(this.token, { mode: md.userSource ? "source" : null });
    } else {
      putRecord(this.token, { mode: this.showsSource(record(this.token)) ? null : "source" });
    }
    cx.notify();
  }

  // ---- Markdown の整形の準備 ----

  // 描画のたびに、Markdown の今の内容を見え方の決まりに渡す（開いたとき・中身が変わったとき）。描画の中で済む大きさなら、
  // ここで整形の準備を終える（前の描画がその準備の途中で打ち切られていたら、描画の外に移す）。描画の外で準備するものがあれば、
  // 区切りながら進める。
  // .mmd も同じ決まり（lib/mmd.js）で、ファイル全体を図 1 つの文書として準備する。
  syncMarkdown(rec, t, cx) {
    const file = this.file;
    const type = this.preparedType();
    if (!type || file.loading || !file.editor) return;
    const text = file.editor.value();
    const look = type === "markdown" ? this.bodyLook(t) : this.mmdLook(t);
    if (!this.md) {
      const fileOf = (part, look) => diagramFile(this.token, part, look);
      this.md = type === "markdown" ? new MarkdownState({ fileOf }) : diagramFileState({ fileOf });
      this.md.setLook(look);
      this.md.open(text, { userSource: rec?.mode === "source" });
    } else {
      this.md.setLook(look);
      this.md.sync(text);
    }
    if (this.md.needsRun && !this.preparing && this.visible()) this.runPreparation(cx);
    // 差し替えが済んだら、使わなくなった図の SVG を消す。
    if (this.md.shown !== this.cleaned) {
      const md = this.md;
      this.cleaned = md.shown;
      cx.spawn(async () => this.dropUnusedSvgs(md));
    }
  }

  // 整形の準備の決まり（this.md）で出すファイルの種類（"markdown" | "mermaid"）。ほかは null。
  preparedType() {
    const type = this.file?.view?.type;
    return type === "markdown" || type === "mermaid" ? type : null;
  }

  // .mmd の図の見た目（テーマの色と、今の倍率。枠に収める倍率なら枠の大きさ）。枠の大きさがまだ分からなければ、窓の描ける大きさで見積もる。
  mmdLook(t) {
    const zoom = this.file.zoom ??= diagramZoom();
    const colors = diagramColors(t);
    if (!zoom.fit) return scaleLook(colors, zoom.scale);
    const view = zoom.view ?? { width: window.viewport_size().width, height: window.viewport_size().height };
    return fitLook(colors, { width: view.width, height: view.height, max: zoom.fitMax });
  }

  // .mmd の図の配置（準備中の中身か、出している中身のもの）。まだ無ければ null。
  mmdLayout() {
    const part = (this.md?.job?.parts ?? this.md?.shown?.parts)?.[0];
    return part?.layout ?? null;
  }

  // 本文の図の見た目（テーマの色と本文の幅）。本文の幅がまだ分からなければ、窓の描ける大きさから見積もる。
  bodyLook(t) {
    const width = bodyWidth(this.mdBox) ?? Math.max(120, window.viewport_size().width - 48);
    return bodyLook(diagramColors(t), width);
  }

  // 描画の外の整形の準備を、1 区間ずつ入出力の await で区切って進める。区間ごとに自分のタブを表示しているかを取り直し
  // （this.me は描画の中でしか取り直さない）、表示していなければ止める（表示に戻った描画で続きを始める）。
  // 描き直しは、出すものが変わったときだけ求める（大きな整形表示の描き直しは重い。ガイドの「制約」）。
  // 印を外されたら（読み込み直した、見張りが手放した）、その非同期処理は進めずに終える。
  runPreparation(cx) {
    const md = this.md;
    const run = this.preparing = {};
    cx.spawn(async (cx) => {
      let notified = Date.now();
      try {
        while (this.preparing === run && md.needsRun) {
          // spawn の中身は最初の await まで、呼んだ描画の中で動き、そこでの cx.notify() は例外になる（ガイドの「制約」）ので、
          // 区間の前に区切る。
          await pauseForApp();
          if (this.preparing !== run || !md.needsRun) break;
          const me = this.identify();
          if (!(me?.space.active && me.tabInfo?.active)) { md.pause(); break; }
          const shown = md.shown, failure = md.failure;
          const task = md.writeTask();
          if (task) await this.writeSvg(md, task);
          else md.tick(PREPARE_SLICE_MS, Date.now);
          // 書いた SVG を読み込ませる（見えない所に置く）ための描き直しは、書き終えたときと、書く間はときどきにする（大きな整形表示の
          // 描き直しは重い）。
          const written = task && (!md.writeTask() || Date.now() - notified > 250);
          if (md.shown !== shown || md.failure !== failure || written) {
            notified = Date.now();
            cx.notify();
          }
        }
      } finally {
        if (this.preparing === run) this.preparing = null;
      }
    });
  }

  // 書いた図の SVG を見えない所で読み込ませる要素の並び。整形表示だけでなく、ソース表示や .mmd の描けない図の表示の間も
  // 描画の木に置く（準備や書き直しは表示を切り替えても続き、読み込みの知らせが来ないと 10 秒で終わらなかったことになる）。
  // 位置を取らない 1 px の枠なので、どの表示にも見える物を足さない。
  preloads() {
    return [this.md && this.preloadsOf(this.md), this.openingPreload()].filter(Boolean);
  }

  // 書いたがまだ読み込んでいない図の SVG を、見えない所で読み込ませる要素。無ければ null。
  preloadsOf(md) {
    const files = md.preloads();
    if (!files.length) return null;
    return preloadImages({ id: "fv-preload", files, onLoaded: (name, cx) => { if (md.loadedImage(name, Date.now())) cx.notify(); } });
  }

  // 図の SVG（タイル 1 枚）を書く（もうあれば書かない）。書く間の時間も、準備を動かしている時間に数える。
  async writeSvg(md, task) {
    const colors = md.look.colors, l = task.part.layout;
    try {
      if (!(await cacheExists(task.name))) {
        await writeCacheText(task.name, diagramSvg(l, colors, { width: task.width, height: task.height, view: tileView(task.file, task, l) }));
      }
      md.wrote(task.name, Date.now());
    } catch (e) {
      md.writeFailed(task.name, message(e), Date.now());
    }
  }

  // 描画の外の準備の区間が戻らないまま止まっていないかを見張る（lib/markdown-state.js の watch）。止まると描き直しも
  // 起きないので、描画ではなくタイマーから見る。止まった非同期処理の finally が動いて印が外れていても見られるよう、
  // 印の有無では絞らない。手放したら、描き直しで代わりの整形表示を出すか、次の準備を始める。
  watchPreparation(cx) {
    if (!this.md?.busy) return;
    const me = this.identify();
    if (!this.md.watch(Date.now, Boolean(me?.space.active && me.tabInfo?.active))) return;
    this.preparing = null;
    cx.spawn(async (cx) => {
      await pauseForApp();
      cx.notify();
    });
  }

  // 整形表示のリンク。http(s) はブラウザ、ほかのファイルは viewer のタブ（プレビュー）で開く。
  followLink(url, cx) {
    const file = this.file;
    if (!file) return;
    const target = resolveLink({ from: file.path, href: url });
    if (target.type === "external") { cx.open_url(target.url); return; }
    if (target.type !== "file") return;
    cx.spawn(async () => {
      // 何があるかだけを、中身を読まずに見る（テキストとして読むと、上限を超える画像などが無いことになる）。
      const found = await pathKind(target.path, file.machine).catch(() => "missing");
      if (found === "folder") { notify({ title: "リンク先はフォルダなので開けない", body: target.path, level: "warning" }); return; }
      if (found !== "file") { notify({ title: "リンク先のファイルが無い", body: target.path, level: "warning" }); return; }
      openFile({ machine: file.machine, path: target.path, double: false });
    });
  }



  // 図を押したら、タブの上に重ねる窓で拡大して見せる（タブは増やさない）。窓に収まる大きさの SVG を書いて、見えない所で
  // 読み込ませてから開く。1 秒たっても終わらなければ、本文の SVG を本来の大きさで出して開く（lib/zoom-svg.js の DiagramOpening）。
  // 書き込みを待つ間も 1 秒を数える（書き込みが遅くても 1 秒で開く）。
  openDiagram(part, cx) {
    const md = this.md;
    if (!part.file || !md?.look || this.opening) return;
    const colors = md.look.colors, l = part.layout;
    const view = window.viewport_size();
    // 窓の描ける大きさ（openOverlay の割合から、見出しの高さを引く）に収める倍率の見積もり。ずれたら窓が書き直す。
    const fit = Math.round(Math.min(3, (view.width * OVERLAY_WIDTH) / l.width, (view.height * OVERLAY_HEIGHT - 36) / l.height) * 1000) / 1000;
    const mark = windowMark();
    const look = scaleLook(colors, fit);
    const file = diagramFile(this.token, part, look, mark);
    const text = diagramSvg(l, colors, { width: l.width, height: l.height });
    const opening = this.opening = { state: new DiagramOpening(Date.now()), file, written: false };
    cx.spawn(async (cx) => {
      const writing = writeTiles(text, file, l).then(
        () => { opening.state.wrote(); opening.written = true; },
        () => { opening.state.failed(); },
      );
      // 書けたら、見えない所で読み込ませるために描き直す。
      let written = false;
      while (this.opening === opening && opening.state.decide(Date.now()) === "wait") {
        await pauseForApp();
        if (opening.written !== written) { written = opening.written; cx.notify(); }
      }
      if (this.opening !== opening) return;
      this.opening = null;
      const natural = opening.state.decide(Date.now()) !== "fit";
      this.lent = natural ? new Set(tileNames(part.file)) : null;
      const shown = !natural ? { ...file, scale: fit } : { ...part.file, scale: part.file.width / l.width };
      // 書き終えずに本文の絵で開くときは、窓に別の印を渡す（窓が収まる大きさの絵を同じ名前で書こうとして、書きかけや書き損じの
      // ファイルを読まないように）。書いていた絵は誰も使わないので、書き込みが終わったら消す。
      const late = !opening.written;
      openOverlay({
        mod: "file-viewer", kind: "dialog", width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT,
        props: { mermaid: part.source, firstLine: part.firstLine, token: this.token, mark: late ? windowMark() : mark, colors, layoutWidth: l.width, layoutHeight: l.height, svg: text, shown },
      });
      cx.notify();
      if (!late) return;
      await writing;
      for (const t of file.tiles) await removeCache(t.path);
    });
  }

  // 拡大の窓を開く前に、書いた絵を見えない所で読み込ませる要素。
  openingPreload() {
    const opening = this.opening;
    if (!opening?.written) return null;
    opening.loaded ??= new Set();
    return preloadImages({ id: "fv-open-preload", files: opening.file.tiles, onLoaded: (name) => {
      opening.loaded.add(name);
      if (opening.loaded.size === opening.file.tiles.length) opening.state.loaded();
    } });
  }

  // 図の拡大の窓。受け取った SVG を画像で出し、倍率やテーマが変わったら書き直す（書き終えて読み込むまで前の絵のまま）。
  renderOverlay(t, cx) {
    const o = this.overlay;
    const close = () => closeOverlay(props()?.overlay);
    const head = h_flex().id("fv-overlay-head").h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(12).text_color(t.muted).child("図の拡大表示（Esc で閉じる）"))
      .when(Boolean(o.zs), (el) => el.child(zoomTools({ id: "fv-overlay-zoom", zoom: o.zoom, width: o.size.width, height: o.size.height, t })))
      .child(button("fv-overlay-close", "閉じる", t, close));
    const root = v_flex().id("fv-overlay").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(); } })
      .child(head);
    if (!o.zs) return root.child(div().p(16).text_color(t.dim).child("図を表示できない"));
    const colors = diagramColors(t), key = colorsKey(colors);
    o.colors[key] ??= colors;
    o.zs.recolor(key);
    if (o.zoom.view) o.zs.request(Math.round(o.zoom.current(o.size.width, o.size.height) * 1000) / 1000);
    this.runOverlayWrites(cx);
    const { file, notice } = o.zs.display();
    const preloads = o.zs.preloads();
    return root
      .when(Boolean(notice), (el) => el.child(this.banner("fv-overlay-notice", `図を書き出せなかった（${notice.kind === "timeout" ? "10 秒たっても終わらなかった" : notice.message}）`, t, t.blocked)))
      .child(zoomArea({
        id: "fv-overlay-area", zoom: o.zoom, width: o.size.width, height: o.size.height, shownScale: file.scale, t,
        content: () => diagramImage(file),
      }))
      .when(preloads.length > 0, (el) => el.child(preloadImages({ id: "fv-overlay-preload", files: preloads, onLoaded: (name, cx) => {
        if (!o.zs.loadedImage(name)) return;
        cx.notify();
        cx.spawn(async () => this.dropOverlaySvgs());
      } })));
  }

  // 拡大の窓の書き出し直しを、描画の外で 1 つずつ進める。o.running は動かしている非同期処理の印で、見張りが手放したら
  // （戻らない書き出しを待ち続けないように）、遅れて戻った非同期処理は次の書き出しを取らずに抜ける。
  runOverlayWrites(cx) {
    const o = this.overlay;
    if (o.running) return;
    const first = o.zs.task();
    if (!first) return;
    const run = (o.running = {});
    cx.spawn(async (cx) => {
      try {
        await pauseForApp();
        for (let task = first; task; task = o.running === run ? o.zs.task() : null) {
          try {
            const text = await this.overlaySvgText(task.colorsKey);
            const file = diagramFile(o.token, { source: o.source, layout: o.size }, scaleLook(o.colors[task.colorsKey], task.scale), o.mark);
            await writeTiles(text, file, o.size, { skipExisting: true });
            o.zs.wrote(task, file);
          } catch (e) {
            o.zs.failed(task, message(e));
          }
          cx.notify();
        }
      } finally {
        if (o.running === run) o.running = null;
      }
    });
  }

  // 色の鍵の色で描いた、配置の大きさの SVG の文字列。まだ無ければ、図を配置し直して作る（描画の外で呼ぶ）。
  async overlaySvgText(key) {
    const o = this.overlay;
    if (o.svgs[key]) return o.svgs[key];
    if (!o.layout?.shown) {
      o.layout = new OverlayLayout(() => layoutMermaid(o.source, o.firstLine));
      await pauseForApp();
      o.layout.run();
    }
    const r = o.layout.shown;
    if (r.error) throw new Error(r.error.message);
    o.svgs[key] = diagramSvg(r.layout, o.colors[key], { width: o.size.width, height: o.size.height });
    return o.svgs[key];
  }

  // 拡大の窓が書いた SVG のうち、もう出していないもの（前の倍率・色の絵）を消す。
  async dropOverlaySvgs() {
    const o = this.overlay;
    for (const name of await listCache()) {
      const owner = svgOwner(name);
      if (owner?.token !== o.token || owner.mark !== o.mark || o.zs.keep().has(name)) continue;
      await removeCache(`${CACHE_DIR}/${name}`);
    }
  }

  // 拡大の窓の見張り: 書き直しが 10 秒たっても終わらないとき、配置し直しが止まったときは、前の絵のまま知らせる。
  watchOverlay(cx) {
    const o = this.overlay;
    if (!o?.zs) return;
    let changed = false;
    if (o.zs.watch(Date.now())) {
      // 時間切れの書き出しは手放したので（lib/zoom-svg.js）、次の倍率・色の要求で書き出しを始め直せるようにする。
      o.running = null;
      changed = true;
    }
    if (o.layout?.watch()) {
      // 配置の途中で止まった非同期処理は戻らないので、書いていた書き出しを失敗にして、次の書き出しを始められるようにする。
      if (o.zs.writing) o.zs.failed(o.zs.writing, o.layout.shown.error.message);
      o.running = null;
      changed = true;
    }
    if (!changed) return;
    cx.spawn(async (cx) => {
      await pauseForApp();
      cx.notify();
    });
  }

  // .mmd / .mermaid: 図で開き、枠に収めて拡大・移動できるようにする。図は書き出した SVG の画像で出し、準備の間は「整形中…」。
  // 描けなければ理由とソース。
  mermaidFile(file, t) {
    const zoom = file.zoom ??= diagramZoom();
    const v = diagramFileView(this.md.display());
    if (v.kind === "preparing") {
      return div().id("fv-mmd-waiting").relative().flex_1().min_h(0).size_full().px(16).py(16).text_color(t.dim)
        .on_size_change((size, cx) => { if (size.width !== zoom.view?.width || size.height !== zoom.view?.height) { zoom.view = size; cx.notify(); } })
        .child("整形中…");
    }
    if (v.kind === "error") {
      return v_flex().id("fv-mmd").flex_1().min_h(0).overflow_y_scrollbar().p(16)
        .child(diagramError({ id: "fv-mmd-error", message: v.message, fence: v.fence, t }));
    }
    const { layout: l, file: svg } = v.part;
    return v_flex().id("fv-mmd-box").relative().flex_1().min_h(0).size_full()
      .child(zoomArea({
        id: "fv-mmd-area", zoom, width: l.width, height: l.height, shownScale: svg.width / l.width, t,
        content: () => diagramImage(svg),
      }));
  }

  body(rec, t, cx) {
    const file = this.file;
    const was = this.bodyShown;
    this.bodyShown = null;
    if (!file) return div().p(16).text_color(t.dim).child(this.token ? "" : "開くファイルが指定されていない");
    if (file.loading) {
      this.bodyShown = "loading";
      return markdownWaiting({ id: "fv-loading", loading: true, box: this.mdBox, t });
    }
    const view = file.view;
    if (view.type === "unopenable") return this.unopenable(file, view, t);
    if (view.type === "image" && !(this.showsSource(rec) && file.editor)) {
      return imageBody({ file, t });
    }
    if (view.type === "markdown" && file.editor && !this.showsSource(rec)) {
      const md = this.md.display();
      if (md.kind === "preparing" || md.kind === "loading") {
        this.bodyShown = md.kind;
        return markdownWaiting({ id: "fv-markdown-waiting", loading: md.kind === "loading", box: this.mdBox, t });
      }
      this.bodyShown = "formatted";
      const entering = was !== "formatted";
      this.mdScroll.expect(measuredParts(md.parts), Date.now(), { fresh: entering });
      if (entering) this.awaitBody(was);
      if (this.mdScroll.collapsed) this.watchBody(cx);
      else this.mdCover = null;
      const cover = this.mdCover === "source" ? Editor.new(file.editor).flex_1().min_h(0)
        : this.mdCover ? waitingLabel(div().size_full(), { loading: this.mdCover === "loading", t }) : null;
      return markdownBody({
        id: "fv-markdown", parts: md.parts, box: this.mdBox, scroll: this.mdScroll, bar: this.bar, cover, t,
        onScroll: (changed, cx) => this.syncBar(changed, cx),
        onWheel: (changed, cx) => { if (changed) this.showBar(cx); this.syncBar(changed, cx); },
        barShown: this.barShow.shown(Date.now()),
        onBarHover: (hovered, cx) => { this.barShow.hover(hovered); cx.notify(); },
        drag: { press: (e) => this.dragPress(e), release: () => this.dragRelease(), move: (e, cx) => this.dragMove(e, cx) },
        onLink: (url, cx) => this.followLink(url, cx),
        onDiagram: (part, cx) => this.openDiagram(part, cx),
      });
    }
    if (view.type === "mermaid" && file.editor && !this.showsSource(rec)) return this.mermaidFile(file, t);
    if (file.editor) {
      if (view.type === "markdown") this.bodyShown = "source";
      return Editor.new(file.editor).flex_1().min_h(0);
    }
    return div().p(16).text_color(t.dim).child("表示できない");
  }

  // ソース表示や待つ間から整形表示に入った。整形表示の部品は中身を描くまでの数フレーム空になる（ガイドの「制約」）ので、
  // 入る前の表示（was）が本文の場所にあったなら、部品が中身を描くまで、それを本文の上に重ねて出し続ける。
  awaitBody(was) {
    this.mdCover = was === "source" || was === "preparing" || was === "loading" ? was : null;
  }

  // 本文の部品が中身を描くのを待っている（縮んでいる）。入ったときに限らず、中身の差し替えやタブの表示に戻ったときにも縮むので、
  // 縮むたびに見て、BODY_WAIT_MS を過ぎても高さの来ない部分は数えるのをやめる（縮んだままだと位置が本文の長さに収まらない）。
  // 見るのは mdScroll ごとに 1 つ。
  watchBody(cx) {
    const scroll = this.mdScroll;
    if (this.bodyWatch === scroll) return;
    this.bodyWatch = scroll;
    cx.spawn(async (cx) => {
      try {
        while (this.mdScroll === scroll && scroll.collapsed) {
          await pauseForApp();
          if (this.mdScroll === scroll && scroll.expire(Date.now(), BODY_WAIT_MS)) cx.notify();
        }
      } finally {
        if (this.bodyWatch === scroll) this.bodyWatch = null;
      }
    });
  }

  // 本文をスクロールした。スクロールバーを出し、出す時間が過ぎたら描き直して消す。
  showBar(cx) {
    this.barShow.scrolled(Date.now());
    if (!this.barTimer) this.hideBarLater(cx);
  }

  hideBarLater(cx) {
    const left = this.barShow.remaining(Date.now());
    if (left === null) { this.barTimer = null; cx.notify(); return; }
    this.barTimer = cx.timer.after(left + 10, (cx) => this.hideBarLater(cx));
  }

  // 本文の中で左ボタンを押した（スクロールバーの上は除く）。app は押したボタンを mouse move で知らせないので、
  // 押している間を自分で覚える。
  dragPress(e) {
    const x = e.local_position?.x, w = e.bounds?.width;
    if (x !== undefined && w !== undefined && x >= w - BAR_INSET * 2 - BAR_WIDTH * 2) return;
    this.selDrag.pressed = true;
  }

  // ボタンを離したか、本文の外に出た（外では mouse move も mouse up も来ないので、そこで止める）。
  dragRelease() {
    this.selDrag.pressed = false;
    this.selDrag.dir = 0;
  }

  // 押したまま動かした。上下の端の帯にいる間、本文をスクロールし続ける。選んでいる範囲は、部品がマウスの動きを受けたときに
  // そこまで伸びる（止めたままだと伸びない。ガイドの「制約」の「選びながらのスクロール」）。
  dragMove(e, cx) {
    const d = this.selDrag;
    if (!d.pressed) return;
    const y = e.local_position.y, h = e.bounds.height;
    if (y < DRAG_EDGE) { d.dir = -1; d.depth = (DRAG_EDGE - y) / DRAG_EDGE; }
    else if (y > h - DRAG_EDGE) { d.dir = 1; d.depth = (y - (h - DRAG_EDGE)) / DRAG_EDGE; }
    else d.dir = 0;
    if (d.dir && !d.running) this.dragScroll(cx);
  }

  // 1 歩ごとに入出力の await を挟む（ガイドの「長い同期処理」）。動いた時間に比べて進めるので、歩の間隔が揺れても速さは同じ。
  dragScroll(cx) {
    const d = this.selDrag, scroll = this.mdScroll;
    d.running = true;
    cx.spawn(async (cx) => {
      try {
        let last = Date.now();
        while (d.pressed && d.dir && this.mdScroll === scroll && this.bodyShown === "formatted") {
          await pauseForApp();
          await cx.sleep(16);
          const now = Date.now();
          const speed = DRAG_SPEED_MIN + (DRAG_SPEED_MAX - DRAG_SPEED_MIN) * Math.min(1, Math.max(0, d.depth));
          const step = d.dir * speed * (now - last) / 1000;
          last = now;
          if (scroll.wheel(-step)) { this.showBar(cx); this.syncBar(true, cx); }
        }
      } finally {
        d.running = false;
      }
    });
  }

  // スクロールの位置が変わった（changed）か、本文の長さが変わったとき。スクロールバーのつまみを位置に合わせる。
  syncBar(changed, cx) {
    const v = Math.round((1 - this.mdScroll.fraction()) * BAR_MAX);
    if (Math.abs(Number(this.bar.value()) - v) > 1) { this.barSet = v; this.bar.set_value(v); changed = true; }
    if (changed) cx.notify();
  }

  unopenable(file, view, t) {
    const reason = view.reason === "binary" ? "バイナリのため表示できない"
      : view.reason === "too-large" ? limitMessage({ limit: view.limit, size: file.size })
      : view.reason === "missing" ? "ファイルが無くなった"
      : `読み込めなかった: ${view.message ?? ""}`;
    return v_flex().id("fv-unopenable").p(20).gap(8)
      .child(div().text_size(14).font_semibold().child(reason))
      .child(div().text_size(12).text_color(t.muted).child(file.path))
      .when(file.size !== undefined, (el) => el.child(div().text_size(12).text_color(t.muted).child(formatSize(file.size))));
  }
}
