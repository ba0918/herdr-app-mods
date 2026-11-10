# herdr-app-mods

herdr-app（Windows の GPUI 製デスクトップ app）用の mod 集。今は同梱の Files より使いやすいファイル表示（File viewer）が入っている。

herdr-app の公式のものではない。

## 入っているもの

| 名前 | 種類 | 内容 |
|---|---|---|
| `file-viewer` | mod | ファイルをメイン領域のタブで表示・編集する viewer。code / Markdown（Mermaid 図を含む）/ 画像 / SVG を扱う。保存、外で書き換えられたときの追従、未保存の編集の下書きもある |
| `file-tree` | mod | 同梱 Files の複製。押したファイルを `file-viewer` のタブで開く |
| `main-viewer` | layout | 同梱 `main` layout の複製。右パネルの Files を `file-tree` に差し替えたもの |

## 動く環境

- Windows の herdr-app と、WSL。反映スクリプトは WSL で動かす（bash、rsync、python3 を使う）。
- 動作を確かめたのは、machine が WSL の space だけ。Windows ローカルの space と ssh の space も同じ作りで動くはずだが、確かめていない。

## 入れ方

WSL で clone して、mod と layout を herdr-app の設定フォルダ（app home）にコピーする。app home は `%HERDR_APP_HOME%` があればそこ、なければ `%USERPROFILE%\.config\herdr-app` になる。

```sh
git clone https://github.com/ba0918/herdr-app-mods.git
cd herdr-app-mods
scripts/deploy.sh file-viewer
scripts/deploy.sh file-tree
scripts/deploy.sh layout
```

画像のコピーと図の絵は、`file-viewer` が app home の `mods/file-viewer-images/` に置く（mod ではないただのフォルダで、`file-viewer` が絵を書くときに無ければ作る）。入れる必要は無い。

`scripts/deploy.sh` はコピーしたあと、mod なら `herdr-app check`（mod の読み込みの確認）で、layout なら `herdr-app status` で、エラーが無いかを確かめる。

コピーしただけでは画面は変わらない。herdr-app で `ctrl-shift-l`（または設定画面）から layout `main-viewer` を選ぶと使える。

## 使い方

- 右パネルの Files でファイルをシングルクリックすると、プレビュータブに開く。別のファイルを押すと、同じタブの中身が入れ替わる。
- ダブルクリックするか編集すると、入れ替わらない固定タブになる。
- 編集したら `ctrl-s` か保存ボタンで保存する。保存の直前にディスクの内容が変わっていたら、保存を止めて、どうするか聞く。

細かい振る舞いは [仕様](docs/spec/file-viewer/index.md) にある。

## 開発

単体テストは [bun](https://bun.sh/) で動かす。

```sh
bun test
```

ドキュメントの入口は [docs/README.md](docs/README.md)。mod の仕組みと、Windows app と WSL での開発の進め方は [mod 開発ガイド](docs/guides/herdr-app-mod-development.md) にある。

## ライセンス

[MIT](LICENSE)。ただし、次のものはそれぞれのライセンスに従う。詳しくは [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) にある。

- `mods/file-tree/` と `layouts/main-viewer.json`：herdr-app の同梱品を改変したもの（Apache License 2.0）
- `mods/file-tree/*.svg`：Lucide のアイコン（ISC License。一部は Feather 由来で MIT License）
- `mods/file-viewer/vendor/dagre.js`：dagre-d3-es と lodash-es（MIT License）
