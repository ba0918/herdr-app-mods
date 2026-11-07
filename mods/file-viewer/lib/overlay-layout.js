// 図の拡大の窓の、図 1 個の配置。描画の中で配置すると重い図で描画が打ち切られるので、描画の外で配置する。
// 配置は図 1 個ぶんで区切れないので、非同期処理が黙って止まったら（ガイドの「長い同期処理」）、描けなかったことにする。
// 描画と非同期処理のつなぎは main.js。

const STALLED = { kind: "stalled", message: "図の配置が終わらなかったので表示できない" };

export class OverlayLayout {
  // layout: 図を配置するもの（{ layout } か { error } を返す）。
  constructor(layout) {
    this.layout = layout;
    this.running = false; // 配置している（run から戻らなければ残る）
    this.result = null;
  }

  // 配置する（描画の外で呼ぶ）。
  run() {
    if (this.result) return;
    this.running = true;
    const result = this.layout();
    this.running = false;
    this.result = result;
  }

  // run の外から時々呼ぶ見張り。配置の途中で run から戻らないまま止まっていれば、描けなかったことにする。
  // 出すものが変わったら true。
  watch() {
    if (!this.running) return false;
    this.running = false;
    this.result = { error: STALLED };
    return true;
  }

  // 出すもの。配置中なら null、終わったら { layout } か { error }。
  get shown() {
    return this.result;
  }
}
