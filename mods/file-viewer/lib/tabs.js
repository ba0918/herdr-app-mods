// viewer のタブの名前と、ツリーで押したときに何をするか。
import { basename, parentName, normalizePath } from "./path.js";

export function tabTitles(tabs) {
  const counts = new Map();
  for (const tab of tabs) {
    const name = basename(tab.path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const titles = {};
  for (const tab of tabs) {
    const name = basename(tab.path);
    let title = counts.get(name) > 1 ? `${name} · ${parentName(tab.path)}` : name;
    if (tab.preview) title = `◇ ${title}`;
    if (tab.dirty) title = `${title} ●`;
    titles[tab.id] = title;
  }
  return titles;
}

// tabs: 今の space の viewer のタブ（{ id, path, preview }）。currentIndex: 今のタブの位置（1 から）。
export function openAction({ tabs, path, double, currentIndex }) {
  const same = tabs.find((tab) => normalizePath(tab.path ?? "") === normalizePath(path));
  if (same) return { action: "select", id: same.id, pin: double && same.preview };
  const preview = tabs.find((tab) => tab.preview);
  if (preview) return { action: "replace", id: preview.id, pin: double };
  return { action: "new", preview: !double, index: currentIndex + 1 };
}
