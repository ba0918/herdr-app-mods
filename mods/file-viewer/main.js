// file-viewer: 1 つのタブに 1 つのファイルを、内容に合った viewer で表示する。
// タブは tab.new {mod: "file-viewer", props: {token, path, machine, preview, index}} で開かれる。
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { spaces, props, theme, settings, run } from "herdr";
import { kind, languageFor } from "./lib/kind.js";
import { formatSize, limitMessage } from "./lib/size.js";
import { tabTitles } from "./lib/tabs.js";
import { record, putRecord, viewerTabsIn, findOwnPane, pruneRecords } from "./registry.js";
import { readText } from "./io.js";

function syntaxColors(t) {
  return { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 };
}

const themeKey = (t) => `${t.background}|${t.foreground}|${t.ansi5}`;

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
    this.file = null;
    this.loadedKey = null;
    this.wrap = false;
    this.pendingTitle = null;
    this.focus = cx.focus_handle();
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

  // 初めて名乗ったとき: 記録を作り（または更新し）、今のタブの右に移る。
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

  load(rec, cx) {
    const key = `${rec.machine ?? null}\n${rec.path}`;
    this.loadedKey = key;
    this.file?.editor?.release();
    this.file = { path: rec.path, machine: rec.machine ?? null, loading: true };
    cx.spawn(async (cx) => {
      const file = { path: rec.path, machine: rec.machine ?? null, loading: false };
      try {
        const first = kind({ path: rec.path, size: 0 });
        if (first.type === "image") {
          file.view = { type: "unopenable", reason: "pending-image" };
        } else {
          const r = await readText(rec.path, file.machine);
          if (this.loadedKey !== key) return;
          if (!r.exists) {
            file.missing = true;
            file.view = { type: "unopenable", reason: "missing" };
          } else {
            file.size = r.size;
            file.view = kind({ path: rec.path, size: r.size, text: r.text });
            if (file.view.type !== "unopenable") {
              file.text = r.text;
              file.base = r.base;
              file.editor = this.makeEditor(rec.path, r.text);
            }
          }
        }
      } catch (e) {
        file.view = { type: "unopenable", reason: "error", message: String(e?.message ?? e) };
      }
      if (this.loadedKey !== key) { file.editor?.release(); return; }
      this.file = file;
      cx.notify();
    });
  }

  makeEditor(path, value) {
    const t = theme();
    this.themeKey = themeKey(t);
    return EditorState.new({
      language: languageFor(path), value, readonly: true, soft_wrap: this.wrap,
      font_family: settings().font_family, font_size: 13, syntax: syntaxColors(t),
    });
  }

  // 折り返しやテーマを変えるときは、内容を引き継いで Editor を作り直す（後から変える API が無い）。
  rebuildEditor(cx) {
    const file = this.file;
    if (!file?.editor) return;
    const value = file.editor.value();
    file.editor.release();
    file.editor = this.makeEditor(file.path, value);
    cx.notify();
  }

  syncTitle(me, rec, cx) {
    const titles = tabTitles(viewerTabsIn(me.space.id));
    const title = titles[this.token];
    if (!title || title === me.tabInfo.name || title === this.pendingTitle) return;
    this.pendingTitle = title;
    cx.spawn(async () => { run("tab.rename", { id: me.tab, name: title }); });
  }

  render(cx) {
    const t = theme();
    const me = this.identify();
    if (me && this.pane !== me.pane && this.claiming !== me.pane) {
      this.claiming = me.pane;
      cx.spawn(async (cx) => this.claim(me, cx));
    }
    const rec = this.token ? record(this.token) : null;
    const path = rec?.path ?? props()?.path ?? null;
    if (me && rec?.pane === me.pane) {
      if (path && `${rec.machine ?? null}\n${path}` !== this.loadedKey) {
        const load = { ...rec, machine: rec.machine ?? null, path };
        this.loadedKey = `${load.machine}\n${path}`;
        cx.spawn(async (cx) => this.load(load, cx));
      }
      this.syncTitle(me, rec, cx);
    }
    if (this.file?.editor && this.themeKey !== themeKey(t)) cx.spawn(async (cx) => this.rebuildEditor(cx));

    return v_flex().id("fv-root").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.focus)
      .child(this.toolbar(rec, t))
      .child(this.body(t));
  }

  toolbar(rec, t) {
    const file = this.file;
    const isCode = file?.view?.type === "code";
    return h_flex().id("fv-toolbar").h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(file?.path ?? ""))
      .when(Boolean(rec?.preview), (el) => el.child(button("fv-pin", "固定", t, (cx) => { putRecord(this.token, { preview: false }); cx.notify(); })))
      .when(isCode, (el) => el.child(button("fv-wrap", "折り返し", t, (cx) => { this.wrap = !this.wrap; this.rebuildEditor(cx); }, this.wrap)));
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
      : view.reason === "missing" ? "ファイルが無い"
      : view.reason === "pending-image" ? "画像の表示はまだ作っていない"
      : `読み込めなかった: ${view.message ?? ""}`;
    return v_flex().id("fv-unopenable").p(20).gap(8)
      .child(div().text_size(14).font_semibold().child(reason))
      .child(div().text_size(12).text_color(t.muted).child(file.path))
      .when(file.size !== undefined, (el) => el.child(div().text_size(12).text_color(t.muted).child(formatSize(file.size))));
  }
}
