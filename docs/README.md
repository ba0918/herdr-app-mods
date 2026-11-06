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
- [File viewer 仕様の細部の実装計画](plans/file-viewer-details.md) — 改行・BOM・文字コード・知らせの重なり・Markdown の画像の改訂を入れる手順
- [herdr-app mod 開発ガイド](guides/herdr-app-mod-development.md) — mod の仕組み、この環境（Windows app + WSL）での開発ループ、組み込み方、制約

用語はリポジトリ直下の [CONTEXT.md](../CONTEXT.md) にある。
