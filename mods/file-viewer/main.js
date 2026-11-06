// file-viewer: 1 つのタブに 1 つのファイルを、内容に合った viewer で表示・編集する。
// タブは tab.new {mod: "file-viewer", props: {token, path, machine, preview, index}} で開かれる。
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, props, theme, settings, run } from "herdr";
import { kind, languageFor } from "./lib/kind.js";
import { formatSize, limitMessage } from "./lib/size.js";
import { tabTitles } from "./lib/tabs.js";
import { preserveLineEndings, looksNonUtf8 } from "./lib/save.js";
import { record, putRecord, viewerTabsIn, findOwnPane, pruneRecords } from "./registry.js";
import { readText, checkChanged, writeText, WriteConflict } from "./io.js";

const POLL_MS = 2000;

function syntaxColors(t) {
  return { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 };
}

const themeKey = (t) => `${t.background}|${t.foreground}|${t.ansi5}`;
const fileKey = (machine, path) => `${machine ?? null}\n${path}`;
const message = (e) => String(e?.message ?? e);

function button(id, label, t, onClick, active = false) {
  return div().id(id).h(24).px(8).flex_none().items_center().justify_center().rounded(6).cursor_pointer().text_size(12)
    .text_color(active ? t.foreground : t.muted).when(active, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)).child(label);
}

export default class FileViewer extends View {
  init(_props, cx) {
    const p = props() ?? {};
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
    this.focus = cx.focus_handle();
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
  }

  async close() {
    this.file?.editor?.release();
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
    this.pane = me.pane;
    if (first) {
      let index = rec?.index ?? p.index;
      const before = me.space.tabs.find((t) => t.id === this.activeBefore[me.space.id] && t.id !== me.tab);
      if (!index && before) index = before.index + 1;
      if (index && index !== me.tabInfo.index) run("tab.move", { id: me.tab, index });
      pruneRecords();
    }
    cx.notify();
  }

  // ---- 読み込み ----

  load(target, cx) {
    const key = fileKey(target.machine, target.path);
    this.loadedKey = key;
    this.file?.editor?.release();
    this.file = { path: target.path, machine: target.machine ?? null, loading: true };
    cx.spawn(async (cx) => {
      const file = await this.read(target.path, target.machine ?? null);
      if (this.loadedKey !== key) { file.editor?.release(); return; }
      this.file = file;
      this.setDirty(false);
      cx.notify();
    });
  }

  async read(path, machine) {
    const file = { path, machine, loading: false };
    try {
      if (kind({ path, size: 0 }).type === "image") {
        file.view = { type: "unopenable", reason: "pending-image" };
        return file;
      }
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
    cx.spawn(async (cx) => {
      const next = await this.read(file.path, file.machine);
      if (this.loadedKey !== key) { next.editor?.release(); return; }
      file.editor?.release();
      this.file = next;
      this.setDirty(false);
      cx.notify();
    });
  }

  // ---- 外部変更 ----

  poll(cx) {
    const file = this.file;
    if (!file || file.loading || file.busy || !this.visible()) return;
    if (!file.base && !file.missing) return;
    file.busy = true;
    const key = this.loadedKey;
    cx.spawn(async (cx) => {
      try {
        const r = await checkChanged(file.path, file.machine, file.base);
        if (this.loadedKey !== key || this.file !== file) return;
        if (r.missing) {
          if (!file.missing) { file.missing = true; cx.notify(); }
          return;
        }
        const back = file.missing;
        file.missing = false;
        if (!r.changed) { if (back) cx.notify(); return; }
        if (!file.dirty) { file.busy = false; this.reload(cx); return; }
        if (file.dismissed === r.base.hash) { if (back) cx.notify(); return; }
        file.notice = { kind: "external", hash: r.base.hash };
        cx.notify();
      } catch {
        // 一時的な失敗（machine に届かない等）は次の確認で取り直す。
      } finally {
        file.busy = false;
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
    if (!file?.editor || file.readonly || file.busy) return;
    if (file.missing) {
      file.notice = { kind: "recreate" };
      cx.notify();
      return;
    }
    if (!file.dirty) return;
    file.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await checkChanged(file.path, file.machine, file.base);
        if (r.missing) { file.missing = true; file.notice = { kind: "recreate" }; return; }
        if (r.changed) { file.notice = { kind: "conflict", base: r.base }; return; }
        await this.write(file, file.base);
      } catch (e) {
        file.notice = { kind: "error", text: `保存できなかった: ${message(e)}` };
      } finally {
        file.busy = false;
        cx.notify();
      }
    });
  }

  // base を基準に書く（null ならファイルを作る）。食い違えば確認に戻す。
  async write(file, base) {
    const content = preserveLineEndings(file.text ?? "", file.editor.value());
    try {
      file.base = await writeText(file.path, file.machine, content, base);
    } catch (e) {
      if (!(e instanceof WriteConflict)) throw e;
      if (e.reason === "missing") { file.missing = true; file.notice = { kind: "recreate" }; }
      else file.notice = { kind: "conflict", base: null };
      return;
    }
    file.text = content;
    file.shown = file.editor.value();
    file.missing = false;
    file.notice = null;
    file.dismissed = null;
    this.setDirty(false);
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
    file.busy = true;
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
        file.busy = false;
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
      .child(this.body(t));
  }

  toolbar(rec, t) {
    const file = this.file;
    const isCode = file?.view?.type === "code";
    return h_flex().id("fv-toolbar").h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(file?.path ?? ""))
      .when(Boolean(rec?.preview), (el) => el.child(button("fv-pin", "固定", t, (cx) => { putRecord(this.token, { preview: false }); cx.notify(); })))
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
    return out;
  }

  body(t) {
    const file = this.file;
    if (!file) return div().p(16).text_color(t.dim).child(this.token ? "" : "開くファイルが指定されていない");
    if (file.loading) return div().p(16).text_color(t.dim).child("読み込み中…");
    const view = file.view;
    if (view.type === "unopenable") return this.unopenable(file, view, t);
    if (file.editor) return Editor.new(file.editor).flex_1().min_h(0);
    return div().p(16).text_color(t.dim).child("表示できない");
  }

  unopenable(file, view, t) {
    const reason = view.reason === "binary" ? "バイナリのため表示できない"
      : view.reason === "too-large" ? limitMessage({ limit: view.limit, size: file.size })
      : view.reason === "missing" ? "ファイルが無くなった"
      : view.reason === "pending-image" ? "画像の表示はまだ作っていない"
      : `読み込めなかった: ${view.message ?? ""}`;
    return v_flex().id("fv-unopenable").p(20).gap(8)
      .child(div().text_size(14).font_semibold().child(reason))
      .child(div().text_size(12).text_color(t.muted).child(file.path))
      .when(file.size !== undefined, (el) => el.child(div().text_size(12).text_color(t.muted).child(formatSize(file.size))));
  }
}
