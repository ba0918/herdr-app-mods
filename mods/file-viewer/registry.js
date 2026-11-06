// viewer のタブの記録（どのタブが何を開いているか）と、ファイルを viewer のタブに開く操作。
// viewer のタブはタブごとに別のコピーとして動くので、記録は shared に置いて全コピーで共有する。
// file-tree からも使う（file-tree の registry.js はこのファイルへのリンク）。
import { shared, setShared, panes, spaces, focused, machines, run } from "herdr";
import { randomUUID } from "crypto";
import { openAction } from "./lib/tabs.js";
import { normalizePath } from "./lib/path.js";
import { staleRecords, PENDING_MS } from "./lib/records.js";

export const MOD = "file-viewer";
const TABS = "file-viewer:tabs";

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

// 閉じたタブの記録と、名乗らないまま古くなった記録を消す（判断は lib/records.js）。
export function pruneRecords() {
  const all = records();
  const claimed = new Set(Object.values(all).map((r) => r.pane).filter(Boolean));
  const machineOfTab = new Map(spaces().flatMap((s) => s.tabs.map((t) => [t.id, s.machine ?? ""])));
  const { drop, mark, unmark } = staleRecords({
    records: all,
    livePanes: new Set(viewerPanes().map((p) => p.pane)),
    readyMachines: new Set(machines().filter((m) => m.layout === "ready").map((m) => m.name ?? "")),
    unclaimedMachines: new Set(viewerPanes().filter((p) => !claimed.has(p.pane)).map((p) => machineOfTab.get(p.tab)).filter((m) => m !== undefined)),
    now: Date.now(),
  });
  if (!drop.length && !unmark.length && !Object.keys(mark).length) return;
  const next = { ...all };
  for (const token of drop) delete next[token];
  for (const [token, at] of Object.entries(mark)) next[token] = { ...next[token], missingSince: at };
  for (const token of unmark) next[token] = { ...next[token], missingSince: null };
  setShared(TABS, next);
}

function activeSpace() {
  return spaces().find((s) => s.active) ?? null;
}

// ファイルを今の space の viewer のタブに開く。double: ダブルクリック（固定タブとして開く）。
export function openFile({ machine, path: given, double }) {
  // 記録・下書き・読み込みの鍵が、どの入口（ツリー・リンク）から開いても同じパスになるようにする。
  const path = normalizePath(given);
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
