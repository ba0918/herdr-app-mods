// file-viewer: 1 つのタブに 1 つのファイルを、内容に合った viewer で表示・編集する。
// タブは tab.new {mod: "file-viewer", props: {token, path, machine, preview, index}} で開かれる。
import { View, div } from "gpui-kit";
import { randomUUID } from "crypto";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
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
import { OverlayLayout } from "./lib/overlay-layout.js";
import { record, putRecord, viewerTabsIn, findOwnPane, pruneRecords, openTokens, openFile } from "./registry.js";
import { readText, checkChanged, checkUtf8, statOf, pathKind, writeText, WriteConflict, listDrafts, writeDraft, deleteDraft, draftName, copyImage, removeCache, listCache, CACHE_DIR, pauseForApp } from "./io.js";
import { markdownBody, markdownPreparing, diagramError } from "./views/markdown.js";
import { imageBody, imageInfo } from "./views/image.js";
import { Zoom, zoomTools, zoomArea } from "./views/zoom.js";
import { diagram } from "./views/mermaid.js";

const POLL_MS = 2000;
// 画像のコピーの名前: <token>-<内容のハッシュ 12 桁>.<拡張子>（運搬中の .b64 も含む）。
const CACHE_NAME = /^(.+)-[0-9a-f]{12}\.[^.]+(\.b64)?$/;
const DRAFT_MS = 3000;
// 描画の外の整形の準備の 1 区間（仕様の「整形の準備」。ガイドの「長い同期処理」の 0.5 秒より十分短く）。
const PREPARE_SLICE_MS = 100;
// 図の拡大の窓で、配置が止まっていないかを見る間隔。
const OVERLAY_WATCH_MS = 1000;

function syntaxColors(t) {
  return { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 };
}

const themeKey = (t) => `${t.background}|${t.foreground}|${t.ansi5}`;
const fileKey = (machine, path) => `${machine ?? null}\n${path}`;
const message = (e) => String(e?.message ?? e);
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
    this.diagrams = new Map();
    // 図の拡大表示（タブの上に重ねる窓）として開かれたコピー。
    if (p.mermaid !== undefined) {
      // layout: 図の配置（lib/overlay-layout.js。最初の描画で作り、描画の外で配置する）。
      this.overlay = { source: p.mermaid, firstLine: p.firstLine ?? 1, zoom: new Zoom({ fitMax: 3 }), layout: null };
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
    // Markdown の整形表示の見え方（lib/markdown-state.js）。開いた中身ごとに作り、外部変更の読み直しや下書きの復元では残す
    // （this.file は読み直しで入れ替わるので、そこには置かない）。
    this.md = null;
    // 描画の外の準備を動かしている非同期処理の印（runPreparation が作る。動かしていなければ null）。
    this.preparing = null;
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
  async close() {
    const file = this.file;
    if (file?.dirty && file.editor) await writeDraft(this.draftOf(file)).catch(() => {});
    // 閉じたタブの画像のコピーは消す（アプリの終了でも消えるが、次に開いたときにコピーし直す）。
    await removeCache(file?.cache);
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
      if (file.cache) await this.dropOtherCaches(file.cache);
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
      const owner = name.match(CACHE_NAME)?.[1];
      if (!owner || !open.has(owner)) await removeCache(`${CACHE_DIR}/${name}`);
    }
  }

  // 同じタブの古い画像のコピー（内容が変わる前のもの）を消す。読み込んだ file を採った後に呼ぶ
  // （捨てるかもしれない読み込みの途中で呼ぶと、表示中のコピーを消してしまう）。
  async dropOtherCaches(keep) {
    for (const name of await listCache()) {
      const path = `${CACHE_DIR}/${name}`;
      if (path !== keep && name.match(CACHE_NAME)?.[1] === this.token) await removeCache(path);
    }
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
    if (this.file?.editor && this.themeKey !== themeKey(t)) cx.spawn(async (cx) => this.rebuildEditor(cx));
    this.syncMarkdown(rec, cx);

    return v_flex().id("fv-root").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.focus).on_key_down((e, cx) => this.onKey(e, cx))
      .child(this.toolbar(rec, t))
      .children(this.notices(t))
      .child(this.body(rec, t));
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
        const r = this.layoutOf(file.editor.value(), 1);
        file.zoom ??= new Zoom();
        return r.layout ? el.child(zoomTools({ id: "fv-mmd-zoom", zoom: file.zoom, width: r.layout.width, height: r.layout.height, t })) : el;
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
    for (const [i, m] of (file.view?.type === "markdown" ? this.md?.display().notices ?? [] : []).entries()) {
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
    if (this.file?.view?.type === "markdown" && this.md) return this.md.display().kind === "source";
    return rec?.mode === "source";
  }

  toggleSource(cx) {
    const md = this.file?.view?.type === "markdown" ? this.md : null;
    if (md) {
      if (md.display().kind === "source") md.enter();
      else md.toSource();
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
  syncMarkdown(rec, cx) {
    const file = this.file;
    if (!file || file.loading || file.view?.type !== "markdown" || !file.editor) return;
    const text = file.editor.value();
    if (!this.md) {
      this.md = new MarkdownState();
      this.md.open(text, { userSource: rec?.mode === "source" });
    } else {
      this.md.sync(text);
    }
    if (this.md.busy && !this.preparing && this.visible()) this.runPreparation(cx);
  }

  // 描画の外の整形の準備を、1 区間ずつ入出力の await で区切って進める。区間ごとに自分のタブを表示しているかを取り直し
  // （this.me は描画の中でしか取り直さない）、表示していなければ止める（表示に戻った描画で続きを始める）。
  // 描き直しは、出すものが変わったときだけ求める（大きな整形表示の描き直しは重い。ガイドの「制約」）。
  // 印を外されたら（読み込み直した、見張りが手放した）、その非同期処理は進めずに終える。
  runPreparation(cx) {
    const md = this.md;
    const run = this.preparing = {};
    cx.spawn(async (cx) => {
      try {
        while (this.preparing === run && md.busy) {
          // spawn の中身は最初の await まで、呼んだ描画の中で動き、そこでの cx.notify() は例外になる（ガイドの「制約」）ので、
          // 区間の前に区切る。
          await pauseForApp();
          if (this.preparing !== run || !md.busy) break;
          const me = this.identify();
          if (!(me?.space.active && me.tabInfo?.active)) { md.pause(); break; }
          const shown = md.shown, failure = md.failure;
          md.tick(PREPARE_SLICE_MS, Date.now);
          if (md.shown !== shown || md.failure !== failure) cx.notify();
        }
      } finally {
        if (this.preparing === run) this.preparing = null;
      }
    });
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

  // 図の解析と配置（同じ文は覚えておく）。{ layout } か { error }。
  layoutOf(source, firstLine) {
    const key = `${firstLine}\n${source}`;
    if (!this.diagrams.has(key)) {
      if (this.diagrams.size > 64) this.diagrams.clear();
      this.diagrams.set(key, layoutMermaid(source, firstLine));
    }
    return this.diagrams.get(key);
  }

  // 図を押したら、タブの上に重ねる窓で拡大して見せる（タブは増やさない）。
  openDiagram(source, firstLine) {
    openOverlay({ mod: "file-viewer", props: { mermaid: source, firstLine }, kind: "dialog", width: 0.92, height: 0.9 });
  }

  // 図の拡大の窓。図の配置は描画の外でし（重い図で描画が打ち切られないように）、終わるまで「配置中…」を出す。
  renderOverlay(t, cx) {
    const o = this.overlay;
    if (!o.layout) {
      o.layout = new OverlayLayout(() => this.layoutOf(o.source, o.firstLine));
      // spawn の中身は最初の await まで、呼んだ描画の中で動く（ガイドの「制約」）ので、配置の前に区切る。
      cx.spawn(async (cx) => {
        await pauseForApp();
        o.layout.run();
        cx.notify();
      });
    }
    const r = o.layout.shown;
    const close = () => closeOverlay(props()?.overlay);
    const head = h_flex().id("fv-overlay-head").h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(12).text_color(t.muted).child("図の拡大表示（Esc で閉じる）"))
      .when(Boolean(r?.layout), (el) => el.child(zoomTools({ id: "fv-overlay-zoom", zoom: o.zoom, width: r.layout.width, height: r.layout.height, t })))
      .child(button("fv-overlay-close", "閉じる", t, close));
    const body = !r ? div().p(16).text_color(t.dim).child("配置中…")
      : r.layout
        ? zoomArea({ id: "fv-overlay-area", zoom: o.zoom, width: r.layout.width, height: r.layout.height, t, content: (w) => diagram(r.layout, w / r.layout.width, t) })
        : div().p(16).child(r.error.message);
    return v_flex().id("fv-overlay").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(); } })
      .child(head).child(body);
  }

  // 図の拡大の窓の配置が、非同期処理の止まりで途中のまま残っていれば、描けなかったことにして描き直す。
  watchOverlay(cx) {
    if (!this.overlay?.layout?.watch()) return;
    cx.spawn(async (cx) => {
      await pauseForApp();
      cx.notify();
    });
  }

  // .mmd / .mermaid: 図で開き、枠に収めて拡大・移動できるようにする。描けなければ理由とソース。
  mermaidFile(file, t) {
    const r = this.layoutOf(file.editor.value(), 1);
    if (r.error) {
      return v_flex().id("fv-mmd").flex_1().min_h(0).overflow_y_scrollbar().p(16)
        .child(diagramError({ id: "fv-mmd-error", message: r.error.message, fence: "```\n" + file.editor.value() + "\n```", t }));
    }
    file.zoom ??= new Zoom();
    return zoomArea({ id: "fv-mmd-area", zoom: file.zoom, width: r.layout.width, height: r.layout.height, t, content: (w) => diagram(r.layout, w / r.layout.width, t) });
  }

  body(rec, t) {
    const file = this.file;
    if (!file) return div().p(16).text_color(t.dim).child(this.token ? "" : "開くファイルが指定されていない");
    if (file.loading) return div().p(16).text_color(t.dim).child("読み込み中…");
    const view = file.view;
    if (view.type === "unopenable") return this.unopenable(file, view, t);
    if (view.type === "image" && !(this.showsSource(rec) && file.editor)) {
      return imageBody({ file, t });
    }
    if (view.type === "markdown" && file.editor && !this.showsSource(rec)) {
      const md = this.md.display();
      if (md.kind === "preparing") return markdownPreparing({ id: "fv-markdown-preparing", t });
      return markdownBody({
        id: "fv-markdown", parts: md.parts, box: this.mdBox, t,
        onLink: (url, cx) => this.followLink(url, cx),
        onDiagram: (source, firstLine) => this.openDiagram(source, firstLine),
      });
    }
    if (view.type === "mermaid" && file.editor && !this.showsSource(rec)) return this.mermaidFile(file, t);
    if (file.editor) return Editor.new(file.editor).flex_1().min_h(0);
    return div().p(16).text_color(t.dim).child("表示できない");
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
