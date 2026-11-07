# ドキュメント

このリポジトリは、herdr-app 用の mod（拡張）を作るためのもの。目標は、同梱の Files / Changes より高機能な file viewer、diff viewer、changes ビュー。

## ディレクトリ

| ディレクトリ | 役割 |
|---|---|
| `spec/` | 仕様: 何を作るか |
| `guides/` | 手順に沿って使うガイド |
| `plans/` | 実装計画（実装ブランチが取り込まれたら消す） |

## 現行のドキュメント

- [File viewer 仕様](spec/file-viewer/index.md) — Files で押したファイルをメイン領域のタブで表示・編集する viewer
- [herdr-app mod 開発ガイド](guides/herdr-app-mod-development.md) — mod の仕組み、この環境（Windows app + WSL）での開発ループ、組み込み方、制約
- [大きな Markdown の整形表示の実装計画](plans/large-markdown.md) — 整形の準備と整形表示の上限を入れる計画（実装ブランチ `large-markdown`）

用語はリポジトリ直下の [CONTEXT.md](../CONTEXT.md) にある。
