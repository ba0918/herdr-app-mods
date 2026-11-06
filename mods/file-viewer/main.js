// file-viewer: 1 つのタブに 1 つのファイルを、内容に合った viewer で表示・編集する。
// タブは tab.new {mod: "file-viewer", props: {token, path, machine, preview, index}} で開かれる。
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, props, theme, settings, run, notify, openOverlay, closeOverlay } from "herdr";
import { kind, languageFor } from "./lib/kind.js";
import { formatSize, limitMessage } from "./lib/size.js";
import { tabTitles } from "./lib/tabs.js";
import { preserveLineEndings, looksNonUtf8 } from "./lib/save.js";
import { draftsFor, expiredDrafts } from "./lib/drafts.js";
import { resolveLink } from "./lib/markdown.js";
import { imageSize } from "./lib/image.js";
import { parseMermaid } from "./lib/mermaid/parse.js";
import { layoutFlowchart, layoutSequence } from "./lib/mermaid/layout.js";
import { record, putRecord, viewerTabsIn, findOwnPane, pruneRecords, openTokens, openFile } from "./registry.js";
import { readText, checkChanged, writeText, WriteConflict, listDrafts, writeDraft, deleteDraft, draftName, copyImage, removeCache, listCache, CACHE_DIR } from "./io.js";
import { markdownBody, diagramError } from "./views/markdown.js";
import { imageBody, imageInfo } from "./views/image.js";
import { Zoom, zoomTools, zoomArea } from "./views/zoom.js";
import { diagram } from "./views/mermaid.js";

const POLL_MS = 2000;
// 画像のコピーの名前: <token>-<内容のハッシュ 12 桁>.<拡張子>（運搬中の .b64 も含む）。
const CACHE_NAME = /^(.+)-[0-9a-f]{12}\.[^.]+(\.b64)?$/;
const DRAFT_MS = 3000;

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
      this.overlay = { source: p.mermaid, firstLine: p.firstLine ?? 1, zoom: new Zoom({ fitMax: 3 }) };
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
    this.focus = cx.focus_handle();
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
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
      path: rec?.path ?? p.path ?? null,
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
    const key = fileKey(target.machine, target.path);
    this.loadedKey = key;
    this.file?.editor?.release();
    const old = this.file?.cache;
    this.file = { path: target.path, machine: target.machine ?? null, loading: true };
    if (old) cx.spawn(async () => removeCache(old));
    cx.spawn(async (cx) => {
      const file = await this.read(target.path, target.machine ?? null);
      if (this.loadedKey !== key) { file.editor?.release(); return; }
      this.file = file;
      this.setDirty(false);
      cx.notify();
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
      if (file.view.type === "unopenable") return file;
      file.text = r.text;
      file.base = r.base;
      file.readonly = looksNonUtf8(r.text);
      this.attachEditor(file, r.text);
    } catch (e) {
      file.view = { type: "unopenable", reason: "error", message: message(e) };
    }
    return file;
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
    if (file.view.type === "unopenable") return file;
    file.cache = r.cache;
    file.base = r.base;
    file.zoom = new Zoom();
    if (file.view.source) {
      const text = await readText(file.path, file.machine);
      if (text.text !== undefined) {
        file.text = text.text;
        file.base = text.base;
        file.readonly = looksNonUtf8(text.text);
        this.attachEditor(file, text.text);
      }
    }
    file.dims = file.text !== undefined ? imageSize({ svg: file.text })
      : /svg$/i.test(file.path) ? imageSize({ svg: String.fromCharCode(...r.header.slice(0, 4096)) })
      : imageSize({ bytes: r.header });
    await this.dropOtherCaches(file.cache);
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

  // 同じタブの古い画像のコピー（内容が変わる前のもの）を消す。
  async dropOtherCaches(keep) {
    for (const name of await listCache()) {
      const path = `${CACHE_DIR}/${name}`;
      if (path !== keep && name.match(CACHE_NAME)?.[1] === this.token) await removeCache(path);
    }
  }

  // Editor を作り、編集の検知をつなぐ。shown は Editor が返す「未編集の内容」（改行を揃えることがあるため読み戻す）。
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

  // ディスクの内容で読み直す（未保存の編集は捨てる）。
  reload(cx) {
    const file = this.file;
    if (!file) return;
    const key = this.loadedKey;
    const before = file.editor?.value();
    cx.spawn(async (cx) => {
      const next = await this.read(file.path, file.machine);
      if (this.loadedKey !== key || this.file !== file) { next.editor?.release(); return; }
      // 読み込みの間に打った文字は捨てない。読み直さずに、ディスクが変わったことを知らせる。
      if (file.editor && file.editor.value() !== before) {
        next.editor?.release();
        if (next.base && (!file.notice || file.notice.kind === "external")) file.notice = { kind: "external", hash: next.base.hash };
        cx.notify();
        return;
      }
      file.editor?.release();
      if (next.zoom && file.zoom) next.zoom = file.zoom;
      this.file = next;
      this.setDirty(false);
      cx.notify();
    });
  }

  // ---- 下書き ----

  draftOf(file) {
    return {
      name: draftName(this.token, file.machine, file.path),
      token: this.token, machine: file.machine, path: file.path,
      content: file.editor.value(), base: file.base ?? null, updatedAt: Date.now(),
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
      cx.spawn(async () => deleteDraft(draftName(this.token, file.machine, file.path)));
    }
  }

  // 開いたファイルに、開いているほかの viewer のタブのものでない下書きがあれば「復元 / 破棄」を聞く。
  async offerDrafts(file) {
    if (!file.editor || file.readonly) return;
    const list = draftsFor({ drafts: await listDrafts(), machine: file.machine, path: file.path, openTokens: openTokens(), selfToken: this.token });
    if (this.file !== file || !list.length) return;
    file.drafts = list;
  }

  restoreDraft(name, cx) {
    const file = this.file;
    const draft = file?.drafts?.find((d) => d.name === name);
    if (!draft || !file.editor) return;
    file.drafts = file.drafts.filter((d) => d !== draft);
    file.editor.set_value(draft.content);
    // 復元は編集として扱う（プレビュータブなら固定タブになる）。保存前の確認の基準は下書きに記録したディスクの状態。
    file.base = draft.base;
    this.setDirty(file.editor.value() !== file.shown);
    file.drafted = null;
    cx.spawn(async (cx) => {
      await deleteDraft(draft.name);
      const r = await checkChanged(file.path, file.machine, draft.base).catch(() => null);
      if (this.file === file && r && (r.missing || r.changed)) file.notice = { kind: "draft-changed" };
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
    if (!file.base && !file.missing) return;
    file.polling = true;
    const key = this.loadedKey, base = file.base;
    cx.spawn(async (cx) => {
      try {
        const r = await checkChanged(file.path, file.machine, base);
        // 確認の間に保存が始まった・終わったなら、この結果は古い。
        if (this.loadedKey !== key || this.file !== file || file.saving || file.base !== base) return;
        if (r.missing) {
          if (!file.missing) { file.missing = true; cx.notify(); }
          return;
        }
        const back = file.missing;
        file.missing = false;
        if (!r.changed) { if (back) cx.notify(); return; }
        if (!file.dirty) { this.reload(cx); return; }
        // 保存の確認など、答えを待っている知らせは上書きしない。
        if (file.notice && file.notice.kind !== "external") return;
        if (file.dismissed === r.base.hash) { if (back) cx.notify(); return; }
        file.notice = { kind: "external", hash: r.base.hash };
        cx.notify();
      } catch {
        // 一時的な失敗（machine に届かない等）は次の確認で取り直す。
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
      file.notice = { kind: "recreate" };
      cx.notify();
      return;
    }
    if (!file.dirty) return;
    file.saving = true;
    cx.spawn(async (cx) => {
      try {
        const r = await checkChanged(file.path, file.machine, file.base);
        if (r.missing) { file.missing = true; file.notice = { kind: "recreate" }; return; }
        if (r.changed) { file.notice = { kind: "conflict", base: r.base }; return; }
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
    const content = preserveLineEndings(file.text ?? "", value);
    try {
      file.base = await writeText(file.path, file.machine, content, base);
    } catch (e) {
      if (!(e instanceof WriteConflict)) throw e;
      if (e.reason === "missing") { file.missing = true; file.notice = { kind: "recreate" }; }
      else file.notice = { kind: "conflict", base: null };
      return;
    }
    file.text = content;
    file.shown = value;
    file.missing = false;
    file.notice = null;
    file.dismissed = null;
    const dirty = file.editor.value() !== value;
    this.setDirty(dirty);
    if (dirty) {
      // 下書きは残し、次の更新で新しい基準のものに書き直す。
      file.drafted = null;
    } else {
      // 保存したら、このタブの下書きは消す。
      file.drafted = undefined;
      await deleteDraft(draftName(this.token, file.machine, file.path));
    }
    // SVG のソースを保存したら、画像表示もコピーし直す。
    if (file.cache) {
      const r = await copyImage(file.path, file.machine, this.token).catch(() => null);
      if (r?.cache && this.file === file) {
        file.cache = r.cache;
        file.dims = imageSize({ svg: content }) ?? file.dims;
        await this.dropOtherCaches(r.cache);
      }
    }
  }

  // 確認の答え。
  answer(choice, cx) {
    const file = this.file;
    const notice = file?.notice;
    if (!notice) return;
    file.notice = null;
    if (choice === "reload") { this.reload(cx); return; }
    if (choice === "keep") { file.dismissed = notice.hash; cx.notify(); return; }
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
            if (r.missing) { file.missing = true; file.notice = { kind: "recreate" }; return; }
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
    if (this.overlay) return this.renderOverlay(t);
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
    const isCode = type === "code" || ((type === "markdown" || type === "image" || type === "mermaid") && source && file?.editor);
    const isImage = type === "image" && !source;
    return h_flex().id("fv-toolbar").h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(file?.path ?? ""))
      .when(Boolean(rec?.preview), (el) => el.child(button("fv-pin", "固定", t, (cx) => { putRecord(this.token, { preview: false }); cx.notify(); })))
      .when(isImage, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(imageInfo(file))))
      .when(isImage, (el) => el.child(zoomTools({ id: "fv-zoom", zoom: file.zoom, width: file.dims?.width ?? 512, height: file.dims?.height ?? 512, t })))
      .when(type === "markdown", (el) => el.child(button("fv-source", source ? "整形表示" : "ソース", t, (cx) => this.toggleSource(cx), source)))
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

  banner(id, text, t, color, actions = []) {
    return h_flex().id(id).flex_none().px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.raised)
      .child(div().w(3).h(16).flex_none().rounded(2).bg(color))
      .child(div().flex_1().min_w(0).text_size(12).child(text))
      .children(actions.map(([key, label]) => button(`${id}-${key}`, label, t, (cx) => this.answer(key, cx))));
  }

  notices(t) {
    const file = this.file;
    if (!file || file.loading) return [];
    const out = [];
    if (file.missing && file.editor) out.push(this.banner("fv-missing", "ファイルが無くなった（表示は無くなる前の内容）", t, t.blocked));
    if (file.readonly) out.push(this.banner("fv-encoding", "UTF-8 でない可能性があるため、読み取り専用で開いている（文字化けしている部分がある）", t, t.blocked));
    const n = file.notice;
    if (n?.kind === "external") out.push(this.banner("fv-external", "ディスクの内容が変わった", t, t.working, [["reload", "ディスクの内容で読み直す"], ["keep", "自分の編集を続ける"]]));
    if (n?.kind === "conflict") out.push(this.banner("fv-conflict", "保存の前にディスクの内容が変わっている", t, t.blocked, [["reload", "ディスクの内容で読み直す"], ["overwrite", "自分の内容で上書きする"], ["cancel", "やめる"]]));
    if (n?.kind === "recreate") out.push(this.banner("fv-recreate", "ファイルが無くなっている。今の内容で作り直す？", t, t.blocked, [["recreate", "作り直す"], ["cancel", "やめる"]]));
    if (n?.kind === "error") out.push(this.banner("fv-error", n.text, t, t.blocked, [["close", "閉じる"]]));
    if (n?.kind === "draft-changed") out.push(this.banner("fv-draft-changed", "下書きの後にディスクが変わっている（保存するときに確かめる）", t, t.working, [["close", "閉じる"]]));
    for (const [i, d] of (file.drafts ?? []).entries()) {
      out.push(h_flex().id(`fv-draft-${i}`).flex_none().px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.raised)
        .child(div().w(3).h(16).flex_none().rounded(2).bg(t.accent))
        .child(div().flex_1().min_w(0).text_size(12).child(`未保存の編集の下書きがある（${when(d.updatedAt)}）`))
        .child(button(`fv-draft-${i}-restore`, "復元", t, (cx) => this.restoreDraft(d.name, cx)))
        .child(button(`fv-draft-${i}-discard`, "破棄", t, (cx) => this.discardDraft(d.name, cx))));
    }
    return out;
  }

  // 表示の切り替え（Markdown の整形 / ソース）はタブごとに記録に持つ。既定は整形表示。
  showsSource(rec) {
    return rec?.mode === "source";
  }

  toggleSource(cx) {
    putRecord(this.token, { mode: this.showsSource(record(this.token)) ? null : "source" });
    cx.notify();
  }

  // 整形表示のリンク。http(s) はブラウザ、ほかのファイルは viewer のタブ（プレビュー）で開く。
  followLink(url, cx) {
    const file = this.file;
    if (!file) return;
    const target = resolveLink({ from: file.path, href: url });
    if (target.type === "external") { cx.open_url(target.url); return; }
    if (target.type !== "file") return;
    cx.spawn(async () => {
      const r = await checkChanged(target.path, file.machine, null).catch(() => ({ missing: true }));
      if (r.missing) { notify({ title: "リンク先のファイルが無い", body: target.path, level: "warning" }); return; }
      openFile({ machine: file.machine, path: target.path, double: false });
    });
  }

  // 図の解析と配置（同じ文は覚えておく）。{ layout } か { error }。
  layoutOf(source, firstLine) {
    const key = `${firstLine}\n${source}`;
    if (!this.diagrams.has(key)) {
      const r = parseMermaid(source, firstLine);
      const value = r.error ? { error: r.error } : { layout: r.diagram.type === "flowchart" ? layoutFlowchart(r.diagram) : layoutSequence(r.diagram) };
      if (this.diagrams.size > 64) this.diagrams.clear();
      this.diagrams.set(key, value);
    }
    return this.diagrams.get(key);
  }

  // 図を押したら、タブの上に重ねる窓で拡大して見せる（タブは増やさない）。
  openDiagram(source, firstLine) {
    openOverlay({ mod: "file-viewer", props: { mermaid: source, firstLine }, kind: "dialog", width: 0.92, height: 0.9 });
  }

  renderOverlay(t) {
    const o = this.overlay;
    const r = this.layoutOf(o.source, o.firstLine);
    const close = () => closeOverlay(props()?.overlay);
    const head = h_flex().id("fv-overlay-head").h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(12).text_color(t.muted).child("図の拡大表示（Esc で閉じる）"))
      .when(Boolean(r.layout), (el) => el.child(zoomTools({ id: "fv-overlay-zoom", zoom: o.zoom, width: r.layout.width, height: r.layout.height, t })))
      .child(button("fv-overlay-close", "閉じる", t, close));
    const body = r.layout
      ? zoomArea({ id: "fv-overlay-area", zoom: o.zoom, width: r.layout.width, height: r.layout.height, t, content: (w) => diagram(r.layout, w / r.layout.width, t) })
      : div().p(16).child(r.error.message);
    return v_flex().id("fv-overlay").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(); } })
      .child(head).child(body);
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
      return markdownBody({
        id: "fv-markdown", text: file.editor.value(), box: this.mdBox, t,
        layoutOf: (source, firstLine) => this.layoutOf(source, firstLine),
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
