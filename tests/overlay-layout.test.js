import { describe, expect, test } from "bun:test";
import { OverlayLayout } from "../mods/file-viewer/lib/overlay-layout.js";
import { layoutMermaid } from "../mods/file-viewer/lib/prepare.js";

const SOURCE = "flowchart LR\nA-->B\nB-->C";
const layout = () => layoutMermaid(SOURCE, 1);

describe("図の拡大の窓の配置", () => {
  test("配置するまでは配置中で、配置が終わると図の配置の結果を出す", () => {
    const l = new OverlayLayout(layout);
    expect(l.shown).toBeNull();
    l.run();
    expect(l.shown).toEqual(layout());
  });

  // 実機では、await を挟まずに約 0.5 秒を超えた非同期処理を QuickJS が黙って止める（ガイドの「長い同期処理」）。
  // ここでは、配置の途中で投げて、run から戻らずに抜ける。
  test("配置の途中で止まったら、見張りで描けなかったことにし、配置中のままにしない", () => {
    const l = new OverlayLayout(() => { throw new Error("止まった"); });
    expect(() => l.run()).toThrow("止まった");
    expect(l.watch()).toBe(true);
    expect(l.shown.error).toBeDefined();
    expect(l.shown.layout).toBeUndefined();
  });

  test("配置を始める前と、配置が終わったあとは、見張りでは変えない", () => {
    const l = new OverlayLayout(layout);
    expect(l.watch()).toBe(false);
    expect(l.shown).toBeNull();
    l.run();
    expect(l.watch()).toBe(false);
    expect(l.shown).toEqual(layout());
  });
});
