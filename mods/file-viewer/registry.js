// viewer のタブの記録（どのタブが何を開いているか）と、ファイルを viewer のタブに開く操作。
// viewer のタブはタブごとに別のコピーとして動くので、記録は shared に置いて全コピーで共有する。
// file-tree からも使う（file-tree の registry.js はこのファイルへのリンク）。
import { shared, setShared, panes, spaces, focused, machines, run } from "herdr";
import { randomUUID } from "crypto";
import { openAction } from "./lib/tabs.js";

export const MOD = "file-viewer";
const TABS = "file-viewer:tabs";
// tab.new の直後、コピーが自分のタブを名乗るまでの記録（pane が null）を有効とみなす時間。
const PENDING_MS = 10_000;

// { [token]: { space, machine, path, preview, mode, pane, dirty, createdAt } }
export function records() {
  return shared(TABS) ?? {};
}

export function record(token) {
  return records()[token] ?? null;
}

export function putRecord(token, patch) {
  const all = records();
  setShared(TABS, { ...all, [token]: { ...(all[token] ?? {}), ...patch } });
}

function dropRecords(tokens) {
  if (!tokens.length) return;
  const all = { ...records() };
  for (const token of tokens) delete all[token];
  setShared(TABS, all);
}

function viewerPanes() {
  return panes().filter((p) => p.mod === MOD);
}

// 開いている viewer のタブの token（そのタブのペインが今ある記録）。
export function openTokens() {
  const live = new Set(viewerPanes().map((p) => p.pane));
  return new Set(Object.entries(records()).filter(([, r]) => r.pane && live.has(r.pane)).map(([token]) => token));
}

// 今の space の viewer のタブ（名乗り待ちの記録も含める）。
export function viewerTabsIn(space) {
  const byPane = new Map(viewerPanes().map((p) => [p.pane, p]));
  const now = Date.now();
  return Object.entries(records())
    .filter(([, r]) => r.space === space && (r.pane ? byPane.has(r.pane) : now - (r.createdAt ?? 0) < PENDING_MS))
    .map(([token, r]) => ({ token, id: token, tab: r.pane ? byPane.get(r.pane).tab : null, path: r.path, preview: Boolean(r.preview), dirty: Boolean(r.dirty) }));
}

// このコピーのペイン。記録にあればそれ、無ければ誰も名乗っていない viewer のペイン
// （複数あれば、フォーカスのあるもの）。見つからなければ null。
export function findOwnPane(token) {
  const fv = viewerPanes();
  const all = records();
  const mine = all[token]?.pane;
  if (mine && fv.some((p) => p.pane === mine)) return fv.find((p) => p.pane === mine);
  const claimed = new Set(Object.entries(all).filter(([t, r]) => t !== token && r.pane).map(([, r]) => r.pane));
  const free = fv.filter((p) => !claimed.has(p.pane));
  if (free.length === 1) return free[0];
  return free.find((p) => p.pane === focused()?.pane) ?? null;
}

// 記録のうち、ペインが無くなったもの（閉じたタブ）と、名乗らないまま古くなったものを消す。
// layout を読み終えていない machine の記録は、ペインが見えないだけかもしれないので残す。
export function pruneRecords() {
  const live = new Set(viewerPanes().map((p) => p.pane));
  const ready = new Set(machines().filter((m) => m.layout === "ready").map((m) => m.name ?? ""));
  const now = Date.now();
  const gone = Object.entries(records()).filter(([, r]) => {
    if (!ready.has(r.machine ?? "")) return false;
    return r.pane ? !live.has(r.pane) : now - (r.createdAt ?? 0) > PENDING_MS * 6;
  }).map(([token]) => token);
  dropRecords(gone);
}

function activeSpace() {
  return spaces().find((s) => s.active) ?? null;
}

// ファイルを今の space の viewer のタブに開く。double: ダブルクリック（固定タブとして開く）。
export function openFile({ machine, path, double }) {
  const space = activeSpace();
  if (!space) return;
  const tabs = viewerTabsIn(space.id);
  const currentIndex = space.tabs.find((t) => t.active)?.index ?? space.tabs.length;
  const act = openAction({ tabs, path, double, currentIndex });
  if (act.action === "select") {
    if (act.pin) putRecord(act.id, { preview: false });
    const tab = tabs.find((t) => t.id === act.id)?.tab;
    if (tab) run("tab.select", { id: tab });
    return;
  }
  if (act.action === "replace") {
    putRecord(act.id, { path, machine, preview: !act.pin, mode: null });
    const tab = tabs.find((t) => t.id === act.id)?.tab;
    if (tab) run("tab.select", { id: tab });
    return;
  }
  const token = randomUUID();
  putRecord(token, { space: space.id, machine, path, preview: act.preview, mode: null, pane: null, createdAt: Date.now(), index: act.index });
  run("tab.new", { space: space.id, mod: MOD, props: { token, path, machine, preview: act.preview, index: act.index } });
}
