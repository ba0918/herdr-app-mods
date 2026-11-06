# File viewer 仕様

herdr-app の Files パネルでファイルを押すと、メイン領域にタブを開き、内容に合った viewer（code / markdown / image）で表示・編集できるようにする。その仕様の入口。

## 構成

- [開き方とタブ](opening-and-tabs.md) — Files ツリーからの開き方、プレビュータブ、タブ名と位置、再起動後の復元、ツリーの表示元
- [viewer](viewers.md) — 種類の判定、code / markdown / image / SVG / 開けないファイル、上限
- [Mermaid 図](mermaid.md) — Markdown 内と .mmd の図の描画、描けない図の扱い
- [編集・保存と外部変更](editing.md) — 編集と保存、保存前の確認、下書き、外で書き換えられたときの追従、文字コードと改行

用語は [CONTEXT.md](../../../CONTEXT.md) にある。プラットフォーム（herdr-app の mod）の事実と制約は [mod 開発ガイド](../../guides/herdr-app-mod-development.md) にある。

## 共通の前提

- 作るものは 2 つの mod と 1 つの layout。viewer の mod は `file-viewer`、ツリーの mod は `file-tree`、layout は `main-viewer`。
- 利用者は layout の切り替え（`ctrl-shift-l` か設定画面）で `main-viewer` を選んで使う。mod を置いただけでは画面は切り替えない。
- `file-tree` は同梱 `files` を `mod.clone` で複製して作る。`main-viewer` は同梱 `main` を `layout.clone` で複製し、右パネルの `files` ブロックの `content.mod` だけを `file-tree` に差し替える。ブロック id `files` は変えない（同梱タブバーのボタンが id で切り替えるため）。
- space の machine に従って動く（その machine 上でファイルを読み書きし、コマンドを実行する）。実機での確認は machine `wsl` の space で行う。この Windows のローカル space や ssh のリモート space は、同じ作りで動く見込みだが確認しない。

## 作らないもの

- Files ツリー自体の強化（検索、件数上限の緩和、アイコン、開いているファイルをツリーで選択状態にする機能など）。別の仕様で扱う。
- PDF・CSV 表・動画などの viewer。
- Files ツリーと Markdown 内リンク以外の入口（パス入力ダイアログ、キー割り当て、ターミナルに出たパスを開くなど）。
- 開けないファイルを既定のアプリで開くボタン。
- UTF-8 以外の文字コードの編集。
- Mermaid の flowchart / sequenceDiagram 以外の図。
- Markdown 内の `<img>` 以外の HTML の画像（`<picture>` の `<source>`、CSS の背景画像）を押せる名前にすること。
- Markdown 内のフォルダへのリンクから、Files のツリーでそのフォルダを開くこと。
- 大きな Mermaid 単体ファイル（`.mmd`）を、描画の外で解析・配置すること（Markdown の[整形の準備](viewers.md#整形の準備)だけが対象）。

## 任せたこと

- viewer 内のボタンやツールバーの並べ方。決めた操作が全部ある限り、並べ方で振る舞いは変わらないため。テーマ色を使い、同梱 mod の見た目に揃える。
- Mermaid の配置計算・描画の方法と、同梱ライブラリの選定（[同梱してよいライブラリ](mermaid.md#同梱してよいライブラリ)の条件内）。どの方法でも、決めた見た目と振る舞いは変わらないため。

## 見送った案

- space ごとの Viewer タブの中に自前のファイルタブ列を持つ — タブの並び・閉じる・復元を mod 内で作り直すことになる
- ターミナルの横にペインとして開く — 開くたびにターミナルが狭くなる
- CSV 表・JSON 整形なども最初から / code と markdown だけ先に — 最初の版が大きくなる / 依頼にあった画像が開けない
- ツリーも作り直して今回含める — 決めることと作る量が倍近くになる
- WSL の space だけに絞る — 他の machine の space で使えなくなる
- 参照だけで先に出す — 保存の試験が通った
- パス入力ダイアログとキー割り当て / 既定のアプリで開くボタン — 今回は入口と範囲を絞る
