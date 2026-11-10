# herdr-app mod 開発ガイド

herdr-app の拡張（mod）がどう動くかと、この環境（Windows の herdr-app + WSL の作業領域）で mod を作って組み込むまでの手順をまとめたガイド。
API の網羅的な説明は herdr-app 自身が生成する一次情報に任せ、ここでは「何を読めばよいか」「この環境で何が違うか」「どう作ってどう確かめるか」を扱う。

調査時のバージョン: herdr-app 0.1.14（`herdr-app --version`）。app の更新で API が変わりうるので、作業前に一次情報を読み直すこと。

- 0.1.14 で、app のソース（下の「一次情報」）と playground で確かめ直したのは次のところ。
  - 「mod の構造」の、`main.js` の無いフォルダと型定義を書くとき。
  - 「制約」の、絵の行（`image(path)`・`image(path)` の形式・`image(path)` の読み込み・`image(path)` の見えない要素・`image(path)` の絵の覚え方・app home の見張り・フォルダの変化の知らせ・`main.js` の無いフォルダと表示しない mod・消してから手放されるまで・`image(path)` のメモリ・`image(path)` の SVG の大きさ）。
  - 「制約」の、コピーの一生の行（コピーができるとき・表示していないコピー・`cx.notify()` と描画・閉じるときの呼び出し・`check`・描画の時間・長い同期処理）。
  - 「制約」の、モジュールのトップレベルと実行環境・窓と app home・メモリ・`fs/promises`・`fs/promises` の `writeFile` の行。
  - 「守るべき規則」の `globalThis` と、playground の「一瞬の空白の撮り方」。
- ソースで確かめたことには v0.1.14 のファイルと行を、測ったことには「playground で測った（0.1.14）」を添える。
- 印の無い記述は、0.1.14 で測り直していない。上に挙げていないところは、0.1.14 のソースとも突き合わせていない。

## 名前の紛らわしさ

| 名前 | 実体 | このリポジトリとの関係 |
|---|---|---|
| `herdr-app` | GPUI（Zed の UI フレームワーク）製のデスクトップ app。Windows 側にインストールされている | 拡張対象 |
| herdr-core（`hc`） | 端末とエージェントを動かし続けるサーバー。WSL 側は `~/.local/bin/herdr-core` | app から `exec` / `hc()` 経由で使う |
| `herdr`（PATH 上、0.9.x） | 別のツール（TUI の multiplexer。herdr-app と同じ提供元かは未確認） | 無関係。`herdr` skill もこちら向けなので読まない |

## 仕組みの全体像

- herdr-app の画面は全部 **mod** で組まれている。サイドバー、タブバー、Files / Changes パネルも同梱 mod（`mods/files`, `mods/changes` など）で、自作 mod と同じ部品・同じ API でできている。
- mod は **JavaScript（ES modules）** で、app 内蔵の QuickJS 上で動く（gpui-kit の gpui-shell）。スクリプトは要素ツリーを「記述」するだけで、描画は Rust 側の GPUI が行う。HTML / CSS / DOM / Web View / `setTimeout` は無い。Node 互換は限定的で、`buffer` `path` `url` `crypto` `zlib` `console` `process` `os` `fs/promises` `net` `websocket` だけが宣言されている（`gpui-kit.d.ts` 末尾）。`fs/promises` は home 内の読み取りと app home 配下への書き込みに限られる（AGENTS.md）。
- 画面の構成は **layout**（`layouts/<name>.json`）が決める。layout のブロックに `{ "mod": "<name>", "props": {...} }` を置くと、そこに mod が表示される。
- 状態の変更はすべて **command**（`run(name, args)`）で行う。キー割り当て・メニュー・CLI（`herdr-app do`）も同じ command 一覧を使う。
- mod フォルダ内のファイルを保存すると、その mod の、読み込まれているコピーがその場で **hot reload** される（表示中のコピーだけでなく、一度できた裏のタブのコピーも。`src/window.rs:3887-3903`）。壊れた保存は前の版が動き続け、エラーは `herdr-app status` に出る。
- mod は信頼されたコードとして動く。プログラム実行（`exec`）とネットワーク（`fetch`）に制限はない。

## この環境の構成

| もの | 場所 |
|---|---|
| app 本体 | `%USERPROFILE%\AppData\Local\Programs\herdr-app\herdr-app.exe`（WSL からは `$WINHOME/AppData/Local/Programs/herdr-app/herdr-app.exe`。PATH には無い） |
| app home（設定・layout・mod） | `%USERPROFILE%\.config\herdr-app`（`$WINHOME/.config/herdr-app`） |
| mod の置き場 | app home の `mods/<name>/` |
| 作業中の space | machine `wsl` 上にある（`herdr-app status` の ID が `wsl/...`） |

以下、Windows のユーザーフォルダ（`%USERPROFILE%`）を WSL から見たパスを `$WINHOME` と書く（求め方は[開発ループ](#開発ループ)の最初の行）。

ここから来る重要な性質:

- mod は **Windows 側のプロセス**で動く。`exec(cmd, args)` を `on` なしで呼ぶと Windows で実行される。WSL のリポジトリに対する `git` などは `exec("git", args, { cwd, on: "wsl" })` のように space の `machine` を渡して herdr-core 経由で実行する。
- `readTextFile(path, { on })` は WSL 側のファイルも読める。`writeTextFile` と `watchFolder` は **app 側（Windows）専用**。WSL の space ではファイル監視が使えないので、タイマーによるポーリングになる（同梱の `files` / `changes` も `on` があるときは watch せず 10 秒ポーリング）。

## 一次情報（読む順）

app 起動のたびに、その版に合わせて書き直される。編集しない。

1. `$WINHOME/.config/herdr-app/AGENTS.md` — layout、keys、command、mod の書き方、ルール全般のガイド
2. `$WINHOME/.config/herdr-app/herdr.d.ts` — `herdr` モジュール（データ、command 実行、exec、ファイル、overlay など）の型
3. `$WINHOME/.config/herdr-app/gpui-kit.d.ts` — UI 要素と部品の型（約 800KB。必要な宣言を検索して読む）
4. `herdr-app.exe commands` — 全 command と引数（JSON）
5. `herdr-app.exe --skill` — エージェントから app を操作するときの手引き
6. 同梱 mod のソース（`mods/files/main.js`, `mods/changes/main.js` ほか）— 実装パターンの見本

app 自身のソースも公開されている。

- 場所: https://github.com/herdrdev/herdr-app （Apache-2.0）。版ごとにタグがある（例: `v0.1.14`）。版ごとの変更は `CHANGELOG.md` にある。
- app 本体（窓、mod のコピーの出し入れ、app home の見張りなど）は `src/` にある。
- gpui-kit と、mod を動かす QuickJS の実行環境は `vendor/gpui-kit/crates/shell` にある。
- GPUI は `vendor/gpui-pre*` にある（要素と画像の読み込みは `vendor/gpui-pre`、OS ごとの部分は `vendor/gpui-pre-windows` など）。

振る舞いは、まず入っている版（`herdr-app --version`）のタグのソースで読み、ソースで決まらないところだけ playground で測る。このガイドでソースを示すときは、そのタグのリポジトリ直下からの相対パスと行で書く（例: `src/window.rs:4954-4965`）。

## mod の構造

```
mods/<name>/
  main.js        必須。View を継承したクラスを default export する
  mod.json       任意。初めて見つかったときの置き場所など
  *.js           追加モジュール（"./ui.js" で import）
  *.svg          アイコン類（"mods/<name>/icon.svg" で参照）
  jsconfig.json  check のときと、app がその mod を読み込むときに一度だけ生成される。以後は自分のもの
  gpui-kit.d.ts  check のときと、app がその mod を読み込むときに生成・上書きされる型定義（コミットしない）
```

- `main.js` の無いフォルダは mod として扱われない（`src/mods.rs:356-386`）。
- app は、その mod のコードを読み込むとき（同じ版のコードを覚えていないとき）に型定義を書く（`vendor/gpui-kit/crates/shell/src/engine/quickjs/mod.rs:2212-2216`）。タブなどに出していない mod のフォルダには、`gpui-kit.d.ts` も `jsconfig.json` も書かなかった（playground で測った（0.1.14））。

`mod.json` で使われているフィールド（同梱 mod から観測）:

- `place`: `"right" | "left" | "top" | "bottom" | "none"`。初めて見つかったとき layout に自動で 1 つ docking する場所。`"none"` なら layout や他の mod が置いたときだけ出る。開発中は `"none"` にしておくと勝手に画面へ出ない
- `size`: 自動 docking 時の大きさ（px）
- `title`: 表示名
- `focusable`: `true` で `pane.go` によるキーボード移動の対象になる
- `overlay`: overlay として開くときの既定（`kind`, `width`, `height`, `at`, `offset` など）

`main.js` の約束:

```js
import { View, div } from "gpui-kit";                       // View, div, svg, image
import { v_flex, h_flex, Editor, EditorState } from "gpui-base"; // レイアウトと部品
import { spaces, panes, focused, exec, theme, run } from "herdr"; // app のデータと操作

export default class MyViewer extends View {
  init(props, cx) { /* 1 回だけ。状態の初期化、cx.timer、cx.spawn の開始 */ }
  render(cx) { /* UI の記述。cx.notify() 後と、app のライブデータ変化時に再実行 */ }
  async close(cx) { /* 任意。消えるときの後始末（最大 250ms） */ }
}
```

守るべき規則（AGENTS.md の「Rules」より、作業で踏みやすいもの）:

- `cx` を保持して後で使わない。コールバックごとに渡される `cx` を使う。
- 非同期処理は `cx.spawn(async (cx) => ...)`、定期処理は `cx.timer.every(ms, (cx) => ...)`。トップレベル `await` は使わない。
- `spaces()` / `focused()` / `theme()` などライブデータはポーリングしない（変化すれば `render` が呼ばれる）。
- アニメーションはタイマー再描画でなく `.frames()` / `.spin()` / `.loop()` / `.transition()` を使う（再描画は窓全体を描き直す）。
- 色は `theme()` の名前付き色を使う。
- モジュールのトップレベルで `globalThis` に副作用を残さない（壊れた保存でもトップレベルは実行済みになる）。`globalThis` は窓に 1 つで、ほかの mod とも共有され、hot reload のあとも残る。`init` などで `globalThis` に置いたものも同じく残る（制約の「モジュールのトップレベルと実行環境」）。

## 開発ループ

ソースはこのリポジトリ（WSL 側）で管理し、app home の `mods/<name>/` に反映して確かめる。

```sh
# Windows のユーザーフォルダを WSL のパスで（WSL の PATH に Windows のフォルダが無くても動くよう cmd.exe をフルパスで呼ぶ）
WINHOME=$(wslpath "$(/mnt/c/Windows/System32/cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')")
APP="$WINHOME/AppData/Local/Programs/herdr-app/herdr-app.exe"

# 1. 単体チェック: mod を一度読み込んで初回描画し、失敗なら正確なエラーで exit 1
#    WSL のパスは wslpath -w で UNC パスにすれば、そのまま渡せる
"$APP" check "$(wslpath -w mods/<name>)"

# 2. app home に反映（保存で hot reload される）。シンボリックリンクはリンク先の中身をコピーし、続けて反映先で check を通す
scripts/deploy.sh <name>

# 3. 実行中の窓の状態とエラー
"$APP" status          # errors[] に file / mod のエラーが出る

# 4. 見た目の確認（窓の最後のフレームを PNG で保存）
"$APP" shot "$(wslpath -w "$WINHOME")\\herdr-shot.png"
```

- app home の `mods/<name>/main.js` をコピーで置き換えても hot reload される。`shot` は Windows 形式のパスを渡すとそこに PNG を書き、そのパスを表示する（どちらも実機で確認）。
- `herdr-app do` は標準入力を読む。`while read` のループの中で呼ぶと、ループの入力を使い切って 1 回で終わった。ループの中では `</dev/null` を付ける（実機で確認）。
- `check` は初回描画と即時の要素までしか見ない。レイアウト計算、仮想リストの遅延行、後から来る非同期状態は検証されないので、実際の窓でも確認する。
- `check` は対象フォルダに `gpui-kit.d.ts` と `jsconfig.json` を書き込む。
- 同梱の mod や layout を直接編集すると、次回起動時に `<name>-edited` へ退避されて元に戻される。必ず clone するか別名の mod を作る。
- 画面が壊れたときの退避: `ctrl-alt-shift-escape` で表示中の layout と `keys.json` を脇に置いて既定の `main` に戻る。

### 確かめ専用の窓（playground）

実機での確認と測定は、作業者の窓ではなく、別の app home で起動した確かめ専用の herdr-app で行う（決まりは [File viewer 仕様の「実機の確かめ」](../spec/file-viewer/index.md#実機の確かめ)）。以下は実機で確かめた手順。

- **app home**: `%USERPROFILE%\.config\herdr-app-playground`（Windows の形式のパス）。mod・layout・設定・`shared.json`（タブごとの記録）は作業者の app と別になる。
- **起動**（作業者の許可を得たときだけ。起動の瞬間に前面を取りうる）: PowerShell で `$env:HERDR_APP_HOME` をそのフォルダにして `Start-Process` で `herdr-app.exe` を**最小化せずに**起動する。herdr-app は前の位置を覚えていても窓を画面の中に戻すので、起動の直後に、前面にしないまま画面の外へ動かす（Win32 の `SetWindowPos(hwnd, HWND_BOTTOM, -8000, -8000, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE)`。`hwnd` は `Get-Process -Id <pid>` の `MainWindowHandle`）。確かめが全部終わるまで閉じない。終わったら `window.close` で閉じる。
- **してはいけないこと**: 最小化しない（描かなくなり、`shot` が古い画面を返す）。最小化から戻さない（戻す手順で一度前面を取った）。`SendInput`・`SetCursorPos`・`AppActivate`・`SetForegroundWindow` は使わない（作業者のマウスと前面を動かす）。
- **操作の送り方**: その窓の `MainWindowHandle` にだけ、Win32 の `PostMessage` で送る。座標はクライアント座標（窓の描ける領域の左上が原点）。前面でない、画面の外の窓でも、次のどれも効いた。
  - クリック: `WM_MOUSEMOVE` のあと `WM_LBUTTONDOWN`（`wParam` = 1）と `WM_LBUTTONUP`。ボタン（拡大の窓や `.mmd` の倍率の「+」、表示の切り替え）も、整形表示の中の図を押して拡大の窓を開くのも効いた。
  - ホイール: `WM_MOUSEWHEEL`。`wParam` の上位 16 ビットが量（負で下へ）、`lParam` は**画面座標**（`ClientToScreen` で直す）。量 -600 で整形表示が約 315 px 下がった。ctrl+ホイールを送れるかは確かめていない（倍率はボタンで変える）。
  - 文字の入力: ソース表示の Editor を押してから、1 文字ずつ `WM_CHAR`（`wParam` = 文字コード）を送ると入った。`WM_KEYDOWN` / `WM_KEYUP` で `VK_RETURN`（13）を送ると改行が入った。
  - 送る側の PowerShell で `SetProcessDPIAware()` を呼ぶ。この機械では `herdr-app shot` の PNG の大きさがクライアントの大きさ（1280 × 820）と同じで、PNG の上の位置をそのままクライアント座標に使えた（画面の拡大率 1。ツールバーの `h(34)` が 34 px で写る）。
- **見る・入れる**: WSL から `HERDR_APP_HOME='<Windows の形式のパス>' WSLENV=HERDR_APP_HOME` を付けて `herdr-app.exe` の `status`・`ls`・`do`・`shot`・`check` を呼ぶ。`scripts/deploy.sh` も同じく付けて流す（`deploy.sh` は `cmd.exe` で `%HERDR_APP_HOME%` を読み、続く `status` もこの環境変数を引き継ぐ）。付け忘れると作業者の app に入れることになるので、環境変数を付けて呼ぶ小さなシェルの関数を作り、その関数でだけ呼ぶ。`shot` は前面でない窓でも今の画面を撮れた。
- **選んでいるスペースとタブは窓ごと**: playground で `space.new` や `tab.new` をすると playground の表示は切り替わるが、作業者の窓の `status` の `space` と `tab` は変わらなかった。
- **守ること**: playground への操作（`do`・`PostMessage`・deploy）のたびに、その直前と直後で、作業者の窓の `status`（`HERDR_APP_HOME` を付けない）の `space` と `tab` と、前面の窓のプロセス（`GetForegroundWindow` と `GetWindowThreadProcessId`）を取って比べ、記録に追記する。操作の前後で作業者の窓が変わった、または前面が playground になったら、その操作をやめる。操作と操作の間に作業者の窓や前面が変わるのは作業者の操作なので気にしない。
- **スペース**: 確かめのタブは machine `wsl` の確かめ専用のスペースに開く。`space.new {"name", "folder", "machine": "wsl"}` で作ると、端末のタブが 1 つ付いてくる。スペースとタブは herdr-core を通して共有されるので、作業者の窓のスペースの一覧にも並ぶ。作業者がそのスペースを表示していない間は、作業者の app はそのタブの file-viewer のコピーを動かさなかった（作業者の app の `shared.json` の `file-viewer:tabs` にそのタブの記録ができず、`file-viewer-cache/` も空のまま、`status` の `errors` も空。今の作りより前の、`file-viewer-cache/` に絵を置く作りで見た。今の作りは `file-viewer-cache/` に書かないので、そこが空でも何も示さない。今の作りでは `shared.json` の記録で確かめる。作業者の app の `mods/file-viewer-images/` には作業者のタブの絵もあるので、大きな絵のファイルの有無では、そのタブのコピーが動いたかを見分けられない）。app は選んでいるスペースの選んでいるタブにだけコピーを作るので（下の「制約」の「コピーができるとき」）、作業者がそのスペースのそのタブを選ぶと、作業者の app にもコピーができて動き始める。そのときの file-viewer の振る舞いは確かめていない。終わったら `space.close {"id", "confirmed": true}` で閉じる。
- **playground の中でだけしてよいこと**: layout の反映（`scripts/deploy.sh layout` を同じ環境変数で）と `layout.switch`、テーマの切り替え（`do app.theme`）。`main-viewer` に切り替えて「Files」を押すと、file-tree のツリーが出た。`app.theme` は playground の窓にだけ効き、作業者の app home の `settings.json` と `layouts/` は変わらなかった。外観がダークの間は、明るいテーマ（`paper`）を選んでも表示は変わらず、ダークのテーマ（`moss`・`ink`・`graphite`）では変わった。
- **一瞬の空白の撮り方**: PowerShell で、playground の窓の `MainWindowHandle` に Win32 の `PrintWindow(hwnd, hdc, 3)`（`PW_CLIENTONLY` と `PW_RENDERFULLCONTENT`）を繰り返し呼び、描ける領域を撮る。画面の外の、前面でない窓でも撮れ、間隔は約 12〜13 ms だった（別の測定では約 17 ms）。flags を 0 と 1 にすると、何も写らない一様な画像になった（1 枚ずつ）。見る場所の平均の色を 1 枚ごとに記録し、背景の色に変わった枚を空白と数える。間隔より短い空白は撮り逃しうる。入力も前面の切り替えも窓の移動もしないが、ほかの操作と同じく、前後で上の「守ること」の確かめをする。
- **描画が打ち切られたかの見方**: 「This view could not be re-rendered」と「interrupted」の帯が出ても、`status` の `errors` は空のままだった。続けて撮った画面に帯が写るかで見る。
- **メモリ**: mod を入れ直すたびに playground のメモリが減って戻らない（下の「制約」の「メモリ」）。入れ直す前に確かめのタブを閉じ、入れ直す回数を減らす。`status` に `out of memory` が出る、表示に `Null"null"` が出る、playground が落ちる・描かなくなったときは、製品の不具合と取り違えず、作業者に再起動の許可を求める。

#### メモリの測り方

[File viewer 仕様の「画像の置き場所」](../spec/file-viewer/index.md#画像の置き場所)の成功条件の手順 (1)〜(4) は、playground で次のように測る（(5) は再起動のあとのファイルの一覧を見るもので、メモリは測らない）。

- **測る値**: playground の herdr-app のプロセスの private bytes（PowerShell の `(Get-Process -Id <pid>).PrivateMemorySize64`。pid は起動のときに控える）。どの手順も、確かめ専用のスペースに viewer のタブが 1 つも無い状態で始めの値を取り、最後の操作から 10 秒後に終わりの値を取って（仕様の成功条件のとおり。下の表のうち、直す前の作りの表と付き添いの mod を使う作りの表の値は、5 秒後に取ったもの）、差（終わり − 始め）を見る。増えたメモリは戻らないので、起動し直した直後の playground で測る。差を見るので、(1)〜(4) は続けて測ってよい。
- **見本**: 4 つのファイルだけを入れたフォルダを作る（メインのチェックアウトの ignore された `.agents/scratch/fv-check/p40/` に置いた。無ければ次のとおり作る）。
  - `a-diagrams-40.md`: 図 40 個の Markdown。図はどれも 6 ノードの flowchart（開始・ひし形の分かれ道・2 つの処理・合流・丸の終了）で、見出しと段落を挟む。
  - `b-partner.png`: 開き替えの相手の 3,000 × 3,000 px の PNG（グラデーション。約 150 KB）。
  - `c-zoom.md` と `d-zoom.mmd`: 同じ図 1 個。6 列 × 12 段のノードを縦につなぎ、偶数の段から右下へも線を引いた flowchart（配置の大きさ 752 × 940 px）。図の大きさは仕様が決めていない。5 ノードの小さな図（228 × 381 px）では、`.mmd` を 3 段上げても約 25 MiB しか増えなかったので、差がはっきり出る大きさにした。
- **スペース**: `space.new` の `folder` を見本のフォルダにし、ツールバーの「Files」を押してツリーを出す（ツリーに見本の 4 つだけが並ぶ）。
- **操作**（押す位置は `shot` で決める。窓 1280 × 820 では、ツリーの行は x 約 1000、y 112・140・168・196、拡大の窓の「−」「+」「閉じる」は y 57 の x 992・1064・1192、`.mmd` のツールバーの「−」「+」は y 95 の x 621・693 だった）:
  - (1) の前に、下の (3) と同じ操作を 1 回しておく。この 1 回の値はどの差にも入れない（起動して初めての拡大の窓と `.mmd` で増える分を (1) に入れないため）。
  - (1) ツリーで `a-diagrams-40.md` と `b-partner.png` を交互に 1 回ずつ押し（シングルクリックでプレビュータブに開く）、5 回ずつ開く。押すたびに、本文が描き終わる（1 秒おきに撮った 2 枚の `shot` で本文の領域が同じになる）まで待ってから次を押す。最後に `tab.close`（`confirmed: true`）でタブを閉じる。
  - (2) 始めの値を取る前にテーマを `moss` にしておく。`a-diagrams-40.md` を `tab.new` の固定タブで開き、`do app.theme` で `ink` と `moss` に交互に 6 回（3 往復）替え、替えるたびに描き終わるまで待つ。タブを閉じる。終わりの値を取ってから、テーマを元に戻す。
  - (3) ツリーで `c-zoom.md` を開き、図を押して拡大の窓を開く。窓の「+」を 3 回、「−」を 3 回、1 回ごとに 4 秒待って押し、「閉じる」を押す。ツリーで `d-zoom.mmd` を押し（同じプレビュータブが替わる）、ツールバーの「+」と「−」を同じく 3 回ずつ押して、タブを閉じる。
  - (4) `a-diagrams-40.md` を `tab.new` で 2 回開き（2 つの固定タブ。後に開いた方が選ばれる）、それぞれ描き終わるまで待つ。選んでいない方（先に開いた方）を閉じてから、残りも閉じる。
  - 各手順のあと `shot` で絵とタブの状態を見て、`status` の `errors` が空なことを見る。
- **作業者の space のタブ**: スペースとタブは作業者の窓と共有されるので、作業者の space の viewer のタブ（測ったときは 6 つ）も playground の `ls` に並ぶ。playground はそれらのスペースを表示していないので、それらの file-viewer のコピーを描いていなかった（起動の直後と (1)〜(4) のあとに、playground の `shared.json` の `file-viewer:tabs` にそれらのスペースの記録が無く、`file-viewer-cache/` も空だった。今の作りより前の、`file-viewer-cache/` に絵を置く作りで見た。今の作りは `file-viewer-cache/` に書かないので、そこが空でも何も示さない。今の作りでは、`shared.json` にそれらのスペースの記録が無いことと、手順のあとの playground の `mods/file-viewer-images/` に大きな絵のファイルが無いことを見る）。作業者のタブは閉じられないが、始めと終わりで同じなので差には効かない。

直す前の作り（名前にタブの印を入れて app home 直下の `file-viewer-cache/` に置く作り）で、起動し直した直後の playground で測った値（MiB。2026-11-10。終わりの値は最後の操作から 5 秒後）:

| 手順 | 始め | 終わり | 差 |
|---|---|---|---|
| (1) プレビュータブで交互に 5 回ずつ開いて閉じる | 313.1 | 534.9 | 221.8 |
| (2) テーマを 3 往復して閉じる | 535.3 | 818.2 | 282.9 |
| (3) 拡大の窓と `.mmd` で 3 段上げ下げして閉じる | 818.6 | 1,048.8 | 230.2 |
| (4) 2 つの固定タブで開き、裏から閉じる | 1,049.2 | 1,334.9 | 285.7 |

どの差も 100 MiB 以上（仕様の「50 MiB を大きく超える」を、基準の 2 倍以上と読む）で、見本や段の数を変えて測り直す必要は無かった。

付き添いの mod を使う作り（付き添いの mod `file-viewer-images` に置き、使わなくなった絵を手放してから消す作り。測ったときの作り。今の作りではない）で、同じ見本と手順で測った値（MiB。2026-11-10。終わりの値は最後の操作から 5 秒後。その作りを app home に入れてから playground を閉じて起動し直し、読み込み直しの無い状態で測った）:

| 手順 | 始め | 終わり | 差 |
|---|---|---|---|
| (1) プレビュータブで交互に 5 回ずつ開いて閉じる | 192.9 | 210.3 | 17.4 |
| (2) テーマを 3 往復して閉じる | 210.7 | 235.2 | 24.5 |
| (3) 拡大の窓と `.mmd` で 3 段上げ下げして閉じる | 234.5 | 216.0 | −18.5 |
| (4) 2 つの固定タブで開き、裏から閉じる | 220.2 | 230.1 | 9.9 |

- どの差も 50 MiB 以下だった。開いている間は増え（(1) は閉じる前 314.6、(2) は開いて 411.1、(4) は 2 つ目を出して 407.3〜442.1）、閉じて 5 秒後には戻った。(3) の差は負になった。手順を閉じたあとの値は測るたびに約 20 MiB 上下し（(1)〜(4) の終わりは 210.3・235.2・216.0・230.1）、(3) の始めの値は (2) のあとテーマを戻した直後に取ったので、その揺れが出たと思われる（確かめていない）。
- 直す前の作りでも付き添いの mod を使う作りでも、上の「操作」のとおり (1) の前に (3) と同じ操作を 1 回してから測り始めた（付き添いの mod を使う作りでは、その 1 回で 171.2 から 193.2 になった）。
- 各手順のあとの `mods/file-viewer-images/` には `main.js`・`mod.json`・`gpui-kit.d.ts`・`jsconfig.json` しか無かった。出している間は、図 40 個の Markdown で 40 個、画像で 1 個、2 つのタブで 80 個の絵があり、(4) で裏のタブを閉じると 10 秒のうちに 40 個に戻った（残ったタブの図は、撮った画面では替わって見えなかった。ただし、図 40 個の `a-diagrams-40.md` のタブを出したまま、図 1 個の `c-zoom.md` の裏のタブを閉じた別の測定では、app は出しているタブの 40 個の絵も手放して読み込み直していた。n=1。制約の「フォルダの変化の知らせ」）。

絵の席の作り（`mods/file-viewer-images/` の絵の席に上書きで書き、使わなくなった絵の席をごく小さい絵で上書きして手放す作り。測ったのはコミット b941ae8 の時点の作りで、そのあとの絵の席の作りの修正では測り直していない）で、同じ見本と手順で測った値（MiB。2026-11-10。終わりの値は最後の操作から 10 秒後。入れてから playground を閉じて起動し直し、読み込み直しの無い状態で、(1) の前に (3) と同じ操作を 1 回してから測った。その 1 回で 174.2 から 197.3 になった）:

| 手順 | 始め | 終わり | 差 |
|---|---|---|---|
| (1) プレビュータブで交互に 5 回ずつ開いて閉じる | 197.3 | 211.8 | 14.5 |
| (2) テーマを 3 往復して閉じる | 210.7 | 212.4 | 1.7 |
| (3) 拡大の窓と `.mmd` で 3 段上げ下げして閉じる | 213.1 | 213.6 | 0.5 |
| (4) 2 つの固定タブで開き、裏から閉じる | 217.4 | 217.9 | 0.5 |

- どの差も 50 MiB 以下だった。開いている間は増え（(1) は閉じる前 315.4、(2) は開いて 385.0、(3) は窓を 3 段上げて 297.5、(4) は 2 つ目を出して 371.3）、閉じて 10 秒後には戻った。
- 各手順のあとの `mods/file-viewer-images/` は、絵の席 1008 個がどれもごく小さい絵（62 バイト）だった。出している間は、図 40 個の Markdown で 40 個、画像で 1 個、2 つのタブで 40 個（同じ図は 2 つのタブで絵の席を共有する）が大きい絵だった。各手順のあとの `status` の `errors` は空で、(4) で裏のタブを閉じたあと、残ったタブの図は撮った画面で正しい絵のままだった。
- (5)（絵の席の作り。コミット 303377a の時点の作りで、playground で測った（0.1.14）。そのあとの修正の作りでは測り直していない）: 確かめ専用のスペースに `a-diagrams-40.md` と `b-partner.png` のタブを開いて描き終えると、大きい絵の席は図の 40 個と画像の 1 個だった。playground を pid を指定して強制終了し（`Stop-Process -Id <pid> -Force`）、起動し直して画面の外へ動かした（前面は起動の前後と 100 ms おきの 2 秒のどれでも playground にならなかった）。起動し直すと、復元されて選ばれていた画像のタブだけがコピーを作り、その画像を絵の席に書いた。続けて `c-zoom.md` の `file-viewer` のタブを開いて 10 秒後には、大きい絵の席は、その画像と開いたタブの図の 2 つだけで、強制終了の前の図 40 個を含むほかの 1,006 個はどれもごく小さい絵だった。そのあと表示していない画像のタブを閉じると、10 秒後にその絵の席もごく小さい絵になった。

#### 一瞬の空白の確かめ方

[画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)の成功条件 (6) は、playground で次のように確かめる（上の「一瞬の空白の撮り方」で撮る）。

- **並べ方**: 確かめ専用のスペースの 1 つのタブを `pane.split` で 3 つのペインに分ける。左に図のある Markdown（`c-zoom.md`）、右上に 4,000 × 4,000 px の PNG を開いた image viewer、右下にプレビューのペイン（props の `preview: true`。始めは `d-zoom.mmd`）。ツールバーの「Files」でツリーも出す。操作していないほうの絵（左の図と右上の画像）を出したまま、次の場面を操作する。
  - 同じタブで倍率を替える: 右下の `.mmd` の「+」。
  - 同じタブでテーマを替える: `do app.theme` で `moss` と `ink` を交互に（右上の画像は操作していない絵。左の図は色が替わるが、空白にならないことも見る）。
  - ほかのタブを開く・閉じる: 右下のペインの下に、図 40 個の Markdown を開いた 4 つ目の file-viewer のペインを `pane.split` で開き、`pane.close` で閉じる（タブを `tab.new` で開くと表示が切り替わって、操作していない絵が見えなくなるため、ペインで代える）。
  - プレビューを替える: ツリーのシングルクリックで、右下のプレビューのペインを `a-diagrams-40.md` と `b-partner.png` に交互に替える（プレビューのペインの記録の `path` が替わり、同じペインで開き直す）。
  - 拡大の窓を開く・閉じる: 左の図を押して開き、「閉じる」で閉じる。窓は開いている間ほかのペインを覆うので、窓が覆っていないコマ（Files の見出しの色で見分ける）だけを数える。
- **見る場所**: 左の図の箱の中（28 × 12 px）、右上の画像（48 × 48 px）、左のペインの何も描いていない所（背景の色。テーマで替わるので、コマごとにこの色と比べる）。操作の約 0.4 秒前から 3 秒、PrintWindow で撮る（間隔は中央値 12〜13 ms、最大 52〜113 ms）。見る場所の平均の色が、そのコマの背景の色との差（RGB の差の和）15 未満なら空白と数える。
- **image viewer の書き直した SVG**（0.1.15、コミット 035f008 の作り、2026-11-11）: 8000 × 8000 の SVG を「収まる大きさ」で出し、「+」と「−」を 5 回ずつ押して、そのたびに 3 秒、PrintWindow で撮った（間隔は中央値 17 ms、最大 66 ms）。絵の中（48 × 48 px）が背景の色になったコマは 0 枚で、絵の左の端の 2 か所（40 × 40 px）は、前の倍率の絵から新しい倍率の絵に 1 コマで替わり、そのあいだのコマ（引き伸ばした・縮めた絵）は無かった（見る場所の中身が違うコマは、どの回も前と後の 2 通りだけ）。外で中身を書き換えたとき（倍率 156% のまま緑と青を入れ替えて 3 回）も、絵の中が背景の色になったコマは 0 枚で、前の色から新しい色に 1 コマで替わった。
- **結果**（playground で測った（0.1.14）。絵の席の作りの、コミット b941ae8 の時点の作りで測り、そのあとの修正の作りでは測り直していない。絵の席は初めの数で足りていた）: どの場面も 5 回ずつで、左の図と右上の画像の空白のコマは 0 枚だった（倍率 0/5、テーマ 0/5、ペインを開く 0/5・閉じる 0/5、プレビューを替える 0/5、拡大の窓を開く 0/5・閉じる 0/5）。テーマを替えるときは、新しい色の背景の中に前の色の図が出てから新しい色の図に替わり、図が背景の色になるコマは無かった。撮った間隔より短い空白（12 ms ほど）は撮り逃しうる。

## 組み込み方

### 1. 既存の Files / Changes パネルを差し替える

`main` layout の右パネルは stack（`panel-body`）で、子ブロックの id が `files` と `changes`。タブバー（同梱 `tabs` mod）のボタンは mod 名ではなく **この子ブロックの id** を `layout.select` で切り替えている。したがって、

1. `herdr-app do layout.clone '{"name":"main","as":"my-main"}'` で layout を複製（複製に切り替わる）
2. `layouts/my-main.json` の `panel-body` の子のうち、`content.mod` だけを自作 mod 名に変える。**ブロック id `files` / `changes` は変えない**

とすれば、`tabs` mod を clone せずに既存ボタンから自作ビューアを開ける。パネル幅は `min` 280 / `max` 900 px。

### 2. ペインやタブとして開く

大きな diff やファイル表示はサイドパネルより広い領域が向いている。

- `run("pane.split", { direction: "right", mod: "<name>", props: { file } })` — 端末の横に mod ペインを開く。props はタブと一緒に保存される
- `run("tab.new", { name, mod: "<name>", props })` — mod だけのタブを開く
- `openOverlay({ mod, props, kind: "dialog" | "popup" | "window", width, height })` — 上に重ねて開く

パネル側の mod から「大きく開く」ボタンで pane / tab を開く、という組み合わせができる。

mod のタブを開いたときの振る舞い（実機で確認）:

- `run()` は `null` を返すので、mod から `tab.new` しても新しいタブの id は分からない。直後の `spaces()` にもまだ新しいタブは出ない。CLI の `herdr-app do tab.new` は `{space, tab, pane}` を返す。
- `tab.new` は新しいタブを space の末尾に作り、表示をそのタブに切り替える（別の space を指定しても、その space に切り替わる）。位置は `tab.move {id, index}` で動かす。
- 開いたコピーの `init(props)` の第 1 引数は `null` で、props は `props()` で読む。`init` の時点の `spaces()` / `focused()` / `panes()` はまだ開く前の状態（前に選ばれていたタブ、新しいペインは無い）を指す。最初の `render` では `panes()` に自分のペインがあり、`focused().pane` が自分のペインになっている。
- そこで、同じ mod のタブが複数あるときにコピーが自分のタブを特定するには、props に一意な token を入れておき、最初の `render` で「どの token も名乗っていない、その mod のペイン」を自分のものとして `shared` に記録する（複数あれば `focused().pane`）。記録したペインの `tab` に `tab.rename` / `tab.move` を送れば、コピーが自分のタブ名と位置を変えられる。
- コピーが別のタブを閉じる `tab.close` は、表示中でない space のタブでも表示を切り替えない。

### 3. キー割り当て

`keys.json` の `"mod:<name>"` セクション、または `"<mod>.<command>"` アクションで mod にコマンドを送り、mod 側は `nextCommand()` で受ける。`keys.json` は少しでも編集すると以後の既定ショートカット更新が止まる点に注意。

`herdr-app do <mod>.<command>` でも表示中のコピーの `nextCommand()` に届く（実機で確認）。開発中、クリックやキー入力の代わりに処理を呼ぶ使い捨ての確かめ方に使える。

## 実装パターン（同梱 mod から）

- **対象の決め方**: `focused()` のペインの `cwd`、無ければ space の `folder`。machine は space の `machine`（端末ブロックにフォーカスがあるときはアドレスの `machine/` 接頭辞）。この組を JSON 文字列にした値を「文脈キー」とし、非同期処理の完了時に文脈キーが変わっていたら結果を捨てる。
- **git の読み取り**: `.git` に何も書かない引数を付ける。`--no-optional-locks -c core.fsmonitor=false -c diff.autoRefreshIndex=false`。書き込みが起きると watch が反応して再読み込みが連鎖する。
- **一覧の取得**: `git status --porcelain=v1 -z --untracked-files=all`、行数は `git diff HEAD --numstat -z`（HEAD が無いリポジトリは `--cached` と作業ツリーを分けて取得）。
- **長いリスト**: `v_virtual_list(id, count, rowHeight, key, render)` で見えている行だけ描く。縦スクロールバーは `Scrollbar.vertical(id)`、横スクロールは外側の `overflow_x_scrollbar()`。
- **ファイル表示**: `EditorState.new({ language, value, readonly: true, font_family, syntax })` + `Editor.new(state)`。`EditorState` は `init` かイベントハンドラ内で作り、不要になったら `release()` する。
- **変化の検知**: app 側のフォルダなら `watchFolder(dir)` のループ、WSL など他 machine ならタイマーでポーリング。WSL への `exec` の往復は 1 回 35〜40 ms（`stat` と `sha256sum` を含めて、実機で確認）。
- **他の mod と処理を共有する**: mod は自分のフォルダの外を import できない（`check` が「resolves outside the application directory」で失敗する）。このリポジトリでは、共有するファイルをシンボリックリンクで置き、`scripts/deploy.sh` がリンク先の中身をコピーする。

## 制約

| 項目 | 内容 |
|---|---|
| `exec` | 30 秒、出力 8 MiB まで。mod の `exec` は Windows 側で `hc` を起動するので、引数を含むコマンドライン全体が UTF-16 で約 32,000 文字を超えると `cannot run hc: ... (os error 206)` で起動できない。`"` はエスケープで 2 文字になる（ASCII 32,600 文字・日本語 30,000 文字は通り、`"` 20,000 文字は失敗。実機で確認）。標準出力は NUL もそのまま返る。WSL で `cat` したファイルの先頭の BOM（`EF BB BF`）は、受けた文字列の先頭に U+FEFF として残り、CR も落ちない（実機で確認） |
| `readTextFile` | 1 MiB まで。先頭の BOM は U+FEFF として残る（このコンピュータのファイルと `{ on: "wsl" }` の両方。実機で確認） |
| `writeTextFile` / `watchFolder` / `pickFolder` | app 側（Windows）のみ |
| `Editor` | 行番号・折りたたみ・意味的な色分け（keyword, string など）はある。`EditorState` のオプションとメソッドに行単位の背景色・装飾は無い。行へのスクロール API も見当たらない（`scroll_to_item` は `v_virtual_list` 用の `VirtualListScrollHandle` にだけある） |
| テキスト装飾 | 1 つのテキストの中で範囲ごとに色を変える API は型定義に見当たらない。色を分けたい単位で要素を分ける |
| 構文解析 | トークナイザ等の API は公開されていない。`Editor` の外で色付けするなら JS 側で行う |
| 外部ライブラリ | 相対 import で同梱した純 JS（ES modules）は使える。上記の限定的な Node 互換モジュールの範囲を超える Node API に依存するものは動かない。`Function` コンストラクタ（`Function("return this")()` など）は禁じられていて実行時に例外になる（lodash がこれを使う。実機で確認） |
| `image(path)` | app home からの相対パスだけ表示できる。絶対パスと、app home の中の名前が「.」で始まるフォルダ（例: `mods/<name>/.cache/`）の下の画像は表示されない（実機で確認）。他 machine の画像は、`exec` で base64 にして運び、app home に書き出してから表示する。`..` を含むパスは、app home の外を指していなくても、app の資産の読み込みが app home の外として断り、画像は「Embedded resource not found」の失敗になって表示されない（`vendor/gpui-kit/crates/shell/src/assets.rs:57-66`、`:79-90`、`vendor/gpui-pre/src/elements/img.rs:657-666`）。app はパスを、`./` と先頭の `/` を落とし、`\` と `/` の違いや重なった `/` をならした相対パスに直して、絵を覚えるキーにする（`vendor/gpui-kit/crates/shell/src/assets.rs:47-66`、`vendor/gpui-kit/crates/shell/src/materialize.rs:1486-1496`）。app home を読む場所にするのは `src/main.rs:156` と `src/mods.rs:51-54` |
| `TextView.markdown` | `gpui-base` から import する（`gpui-kit` には無い）。見出し・表・コードブロック・リンクは表示される。ローカルの画像（相対パス・絶対パス）は表示されない。http(s) の画像も、Markdown の `![](https://...)`・段落の中の `<img>`・HTML のかたまりの中の `<img>` のどれも描かれない（同じ URL は WSL と Windows の両方から取れる。開いて 10 秒待っても出ない）。Markdown の中の HTML は、段落の中の `<a href>` はタグが落ちて中の文字だけがただの文字で出て、押しても `on_link_click` に届かない。HTML のかたまり（空行のあとの `<div>` など）の中の `<a href>` はリンクの見た目で出て、押すと `on_link_click` に href が届く。`<img>` は、段落の中では何も出ず（前後の文字の間が空くだけ）、HTML のかたまりの中では行ごと消える。`<picture>` の中に置いた `<a href>` はリンクの見た目にならず、中の文字だけがただの文字で出る。段落と HTML のかたまりの分け方は CommonMark と同じに見える。空行のあとの `<a href="...">名前</a>` だけの行は、1 つのタグだけの行でないので段落になり、押せない。`<a href="...">` だけの行で始めれば HTML のかたまりになり、次の行の文字と `</a>` まで押せるリンクになる。`data:` の画像も描かれない（どれも実機で確認） |
| 線や図形を描く | `PathBuilder.stroke(幅)` / `PathBuilder.fill()` に `move_to` / `line_to` / `add_polygon` / `dash_array` で組んだ path を、`window.paint_path(path, 色).absolute().top(0).left(0).size_full()` として重ねる。座標は、その要素の左上を原点とする論理 px（`"50%"` のような割合も使える）。mod の中の `window` は GPUI の窓で、`herdr` の `window()` とは別物（実機で確認） |
| 位置指定の文字 | 同じ親の中で `absolute()` にした文字だけの要素が、条件によって描かれないことがあった（Mermaid のシーケンス図で、上段の参加者の箱に重ねた名前だけが出なかった）。名前を箱の要素の子にすると出た。原因は未確認 |
| `image(path)` の形式 | PNG / JPEG / GIF / BMP / ICO / WebP（静止画とアニメーション）/ SVG を表示できる（app home の下にコピーして、実機で確認）。1 つのファイルは 16 MiB まで読み、それより大きいと読み込みの失敗になる（`vendor/gpui-kit/crates/shell/src/assets.rs:27`、`:96-108`）。形式は拡張子でなく中身で決まり、中身から画像の形式が分からないものは SVG として読む（`vendor/gpui-pre/src/elements/img.rs:657-742`、image クレート 0.25 の `guess_format`）。SVG の中身を `.img` と `.png` の名前で、PNG の中身を `.svg` の名前で置いても、正しく描かれた（3 回のうち 3 回）。同じパスを PNG（4,000 × 4,000 px）→ SVG → PNG → 1 × 1 の PNG と書き換えると、そのたびに正しく描き直された（3 回のうち 3 回）。出したまま 1 × 1 に書き換えると、2 回は 5 秒のうちに約 124 MiB 減り、1 回は 5 秒後には減っておらず、40 秒あまり後に減っていた（ここまで playground で測った（0.1.14）） |
| `image(path)` の読み込み | 画像は、要素が初めて配置されたあと描画の外で読み込まれ、読み込む間は何も描かれない（図の場所が空いて見える）。大きさを指定しない `image(path)` を id 付きの `div` で包んで `on_size_change` を付けると、読み込む間は高さ 0、読み込み終えると画像の大きさ（SVG なら `width` / `height` に書いた大きさ。ただし縦か横に書いた大きさが 4,096 px を超える SVG では、ソースからは縮めた大きさが届くと読める（下の「`image(path)` の SVG の大きさ」。確かめていない））が届く（`image(path)` に直接付けた `on_size_change` は呼ばれなかった）。1 px に切り抜いた枠（`overflow_hidden`）の中や、窓の外に置いた要素でも読み込まれて届く。app は画像を読めたときだけ、その大きさを要素の大きさにする（`vendor/gpui-pre/src/elements/img.rs:348-380`）。読み込みの終わりや失敗を mod に知らせる呼び出しは無いので、この高さが 0 より大きくなったことを、読み込み終えた印に使える。読み込んだ画像はパスごとに覚えられる（下の「`image(path)` の絵の覚え方」）。app が見張らない場所（下の「app home の見張り」。例: app home 直下の `file-viewer-cache/`）では、同じパスのファイルを書き換えても前の絵が出続ける（名前を変えれば新しい絵が出る）。SVG の読み込みにかかる時間の例: 箱と文字 400 組の 500 × 2700 px の SVG 14 個で約 0.6 秒（どれも実機で確認）。file-viewer は、書いた図の SVG を見えない所に置いて読み込ませ、読み込み終えてから整形表示を出す |
| `image(path)` の見えない要素 | 見えない要素の中の `image(path)` も読み込まれ、メモリを使う。`div` は子をすべて配置し（`vendor/gpui-pre/src/elements/div.rs:1949-1954`）、`display: none` で省くのは、その先の描く前の準備と描くことだけ（同じファイルの `:2028`、`:2084`）。`visibility: hidden` で省くのは描くことだけ（同じファイルの `:2535`）。画像は配置のときに読み込みを始める（`vendor/gpui-pre/src/elements/img.rs:277-347`） |
| `image(path)` の絵の覚え方 | 読み込んだ絵は、パスのキーごとに app が覚える。読み込みの失敗も覚える。覚えたものは、app が取り除くまで残る（`vendor/gpui-pre/src/app.rs:2897-2937`、`vendor/gpui-pre/src/asset_cache.rs:14-60`。失敗も覚えることは同じファイルのテストの `:160-175`）。古いものから捨てるような上限は無い（GPUI の上限つきの覚え方の `image_cache()` を、gpui-kit も `src/` も使っていない）。app が覚えた絵を取り除くのは、app home の見張り（下の行）がファイルの変化を知らせたときだけで、そのとき絵を手放し、覚えたものを取り除き、SVG を描き直させる（`src/window.rs:3870-3875`、`:4954-4965`）。`image(path)` の絵（`ImgResourceLoader`）を取り除く呼び出しは、ほかに無い（`TextView` が自分で読む画像は別の種類で、`TextView` が消えるときに手放される。`vendor/gpui-kit/crates/shell/src/materialize/text_view.rs:113-122`）。取り除いたあとは、読み込み直す間と、ファイルが無いときは何も描かれない（代わりの絵は無い）。読み込みの失敗は、次に取り除かれるまで覚えられたまま。取り除く前に始まっていた読み込みの結果は捨てられる（`vendor/gpui-pre/src/elements/img.rs:348-421`、`:480-507`、`vendor/gpui-pre/src/asset_cache.rs:29-45`）。mod から絵を手放す API と、バイト列から画像を出す API は無い（型定義） |
| app home の見張り | app は app home 全体を 1 つの見張りで下の階層まで見る（`src/files.rs:71-97`）。知らせを使うのは、`mods/` の下、`layouts/`、`themes/`、直下の `settings.json`・`keys.json`・`programs.json` だけで、ほかの場所（例: app home 直下の `file-viewer-cache/`）の変化は捨てる（`src/files.rs:56-66`、`:115-126`）。そのため、ほかの場所に置いた絵は、ファイルを書き換えても消しても、app を終えるまで手放されない。`mods/` の下では、作る・書き換える・消す・名前を変えるのどれも知らせになる。ただし、どの階層でも、名前が「.」で始まるもの・「~」で終わるもの・`node_modules`（とその下）・`gpui-kit.d.ts` は除く。`jsconfig.json` は mod のフォルダ直下のものだけを除く（`vendor/gpui-kit/crates/shell/src/watch.rs:61-66`）。知らせは 80 ms ためてからまとめて扱う（`src/window.rs:597-603`）。見張りがエラーを返したときは、何も取り除かない（`src/files.rs:57`）。`mods/<X>/` の中に何かを書くと、拡張子に関わらず、X のコピーが読み込まれていれば X を読み直す（`src/window.rs:3887-3903`）。playground でも、`mods/` の下の絵を書き換えると絵が取り直されて前の絵が放され（表示していないタブの絵でも）、`mods/<mod>/` の中の隠しフォルダや `node_modules/` の下では、mod は読み直されず、絵も取り直されなかった |
| フォルダの変化の知らせ | `mods/` の下のフォルダそのものの変化の知らせが来ると、app はそのフォルダの中のファイル全部（下の階層を含む。「.」で始まるものと `node_modules` を除き、2,000 個まで）を変わったものとして扱う。そのフォルダがもう無ければ何も足さない（`src/window.rs:4970-4995`）。次はどれも playground で測った（0.1.14。フォルダの知らせは Windows の FileSystemWatcher で見た）。mod の `fs` で新しいファイルを作る（`fs.writeFile`）・消す（`fs.unlink`）と、同じミリ秒にそのフォルダの変化の知らせが出た（`main.js` のあるフォルダと無いフォルダで、作るのと消すのを 3 回ずつ、計 12 回のうち 12 回）。そのたびに、そのフォルダから出しているすべての絵が手放されて読み込み直された（12 回のうち 12 回。メモリは 185〜357 ms 後に 47〜77 MiB 動いた）。WSL の `cp` や PowerShell の削除のような外からの変化では、フォルダの知らせがすぐには出ないことがあり、そのときは次にどこかのプロセス（mod の `fs.readdir` を含む）がそのフォルダの一覧を取ったときに出た。`main.js` のあるフォルダでは、`mods/` の下が変わるたびに app 自身が mod を探してフォルダの一覧を取るので（`src/mods.rs:357-381`）、変化の 81〜96 ms 後に毎回出た。変わっていないフォルダの一覧を取っても出なかった（`fs.readdir` を 2 秒おきに 10 回で 0 回）。すでにあるファイルをその場で書き換えると（大きさが同じでも違っても）、そのファイルの知らせだけが出て、フォルダの知らせは出なかった（出していないファイルを 10 回書き換えて 0 回。同じフォルダから出している絵は、10 回とも読み込み直されなかった）。出している絵のファイルを書き換えると、その絵だけが読み込み直された（6 回のうち 6 回。同じフォルダのほかの絵は 6 回のうち 0 回）。次の 2 つも playground で測った（0.1.14）。`main.js` の無いフォルダの、出していない既存のファイルを、PowerShell で `[IO.File]::Open(<パス>, [IO.FileMode]::Open, [IO.FileAccess]::Write)` で開いて 4,000 × 4,000 px の PNG のバイト列を書き、`SetLength` で長さを合わせると（作り直さずにその場で書く）、そのファイルの知らせだけが出てフォルダの知らせは出ず、同じフォルダから出している別の 4,000 × 4,000 px の PNG は、上の「一瞬の空白の撮り方」で撮って空白のコマが無く、読み込み直されなかった（5 回のうち 5 回）。書いたファイルをそのあと出すと、最後に書いた絵で描かれた。その場で書いた直後に見えない所で読み込ませると、書いた絵自身の知らせが読み込みのあとに届いて、その絵が一瞬空白になることがあった。mod の `fs.writeFile` で 2,000 × 2,000 px の SVG を書いてすぐ読み込ませ、読み込み終えてから出すと、読み込みは書いてから 63〜89 ms で終わり、101〜128 ms にその絵が捨てられて読み込み直され、出した絵の大きさが一度 0 に戻った（5 回のうち 5 回。撮った画面では 4 回に 3〜6 枚の空白）。上の PowerShell の書き方で 4,000 × 4,000 px の PNG を書いた場合は、書き終えるまでの約 190 ms の間に知らせが出て、すぐ読み込ませても空白は写らなかった（5 回のうち 0 回）。どちらの書き方も、書き終えてから 250 ms 待って読み込ませると、空白も読み込み直しも無かった（道具ごとに 5 回、10 回のうち 0 回。250 ms より短い待ちは測っていない）。どちらの書き方でも、フォルダの知らせは出なかった（その場で書いた 35 回のうち 0 回）。出していたあと隠した 4,000 × 4,000 px の PNG を 1 × 1 の PNG で書き換えると、5 秒のうちに約 123 MiB 減り、ほかの絵は読み込み直されなかった（3 回のうち 3 回）。同じ PNG のファイルを、1 × 1 の空の SVG の文字列（`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`）で mod の `fs.writeFile` でその場で書き換えても、10 秒のうちに約 125 MiB 減った（3 回のうち 3 回。どれも書いてから約 4.2 秒で 100 MiB を超えて減った。playground で測った（0.1.14））。フォルダの知らせは、そのフォルダの下だけに効いた。`sub-a/` でファイルを作る・消すと、`sub-a/` から出している絵は 6 回のうち 6 回読み込み直され、隣の `sub-b/` から出している絵は 6 回のうち 0 回だった。下のフォルダを作る・消す（`mkdir` / `rmdir`）と、親のフォルダの知らせが出て、親の下から出している絵が全部読み込み直された（6 回のうち 6 回）。`mods/` 直下にフォルダを作る・消すと、`mods` の知らせが出て、`mods/` の下から出している絵が全部（同梱の mod のアイコン `mods/terminals-bar/plus.svg` も）読み込み直された（6 回のうち 6 回）。このとき、読み込まれている mod は hot reload されなかった（確かめの mod のモジュールを読み込んだ時刻が変わらず、`status` のエラーも空）。読み込み直す間、絵は空白（背景の色）になる。上の「一瞬の空白の撮り方」で撮ると、同じフォルダで別のファイルを作る・消すたびに、出している 4,000 × 4,000 px の PNG は約 100〜120 ms 空白になった（10 回のうち 10 回）。400 px の SVG では、10 回のうち 5 回に 1 枚だけ空白が写った（もっと短い空白は撮り逃しうる）。file-viewer で図 40 個の文書を開いたタブを出したまま、何も操作しない 60 秒の間は、フォルダの知らせは 0 回で、メモリも横ばいだった（図 1 個の `c-zoom.md` の裏のタブがあるときも同じ。付き添いの mod を使う作りで測った）。その裏のタブを閉じると（付き添いの mod を使う作りで測った）、その絵がごく小さい絵で書き換えられて消され、フォルダの知らせが出て、出しているタブの 40 個の絵も手放されて読み込み直された（メモリが −35 MiB、続いて +112 MiB。2.5〜6 秒後に撮った画面は変わって見えなかった。n=1。この測定では 2.5 秒より前は撮っていない）。最後の file-viewer のタブを閉じると、そのタブのごく小さい絵（62 バイト）が 12 個、30 秒後にも残っていた（付き添いの mod を使う作りで、n=1） |
| `main.js` の無いフォルダと表示しない mod | `mods/` の下の `main.js` の無いフォルダは、mod として扱われない（`src/mods.rs:356-386`）。次はどれも playground で測った（0.1.14）。そこに書いても、ほかの mod は読み直されず、`status` のエラーも出なかった。そこに置いて出した 2 つの絵（4,000 × 4,000 px の png と 2,000 × 2,000 px の SVG）を、出すのをやめてから PowerShell で外から 1 つずつ消すと、消した絵の分だけが手放され、もう一方は残った（n=2）。mod の `fs.unlink` で消すと、すぐにフォルダの変化の知らせが出て、そのフォルダの絵が全部手放される（上の「フォルダの変化の知らせ」）。`main.js` と `place: none` の `mod.json` のあるフォルダ（付き添いの mod `file-viewer-images`）で同じことをすると、1 つ目を消したときに 2 つとも手放され、もう一方は読み込み直されなかった（n=2。上の「フォルダの変化の知らせ」）。`place: none` の mod は、タブなどに開かない限り読み込まれず動かない（モジュールのトップレベルと `init` で印のファイルを書く `main.js` に替えて、開く前は 0 個、タブに開くと 2 個。n=1）。読み込まれていない mod のフォルダに絵を書いても、その mod も、書いた mod も読み直されなかった（その mod をタブとして開いていると、書くたびにそのタブが読み直される） |
| 消してから手放されるまで | 次はどれも playground で測った（0.1.14）。`mods/` の下で、出していた絵を出すのをやめてから消すと、2 段で手放された。消して 0.1〜0.3 秒で約 60 MiB、3.9〜4.4 秒で残りの約 62 MiB が減り、絵を出す前の値から 5 MiB 以内に戻った（png・SVG・gif・webp を 3 回ずつ。形式による違いは無かった）。フォルダごと一度に消すと（WSL の `rm -r` と PowerShell の `Remove-Item -Recurse`。絵 80 枚）、約 3.4 秒で絵を出す前の値から 5 MiB 以内に戻った（n=2）。80 枚のファイルを PowerShell の 1 回の呼び出しで 1 つずつ消すと、約 20 秒後にも 8.5 MiB と 14.3 MiB が残った（n=2。理由は分からない）。フォルダを app home の外へ動かすと、何も手放されず（+893 MiB のまま）、元に戻すと約 3.4 秒で手放された（n=1） |
| `image(path)` のメモリ | 確かめ専用の窓の app のプロセスの private bytes を外から測った（PowerShell の `PrivateMemorySize64`）。SVG は 1 画素あたり約 32.5 バイト、PNG は約 8 バイト（1000×1000・2000×500・2000×2000 の SVG、2000×2000 の PNG で測った）。SVG の値は SVG に書かれた大きさの 1 画素あたりで、app は SVG を縦横 2 倍で画像にするので（下の「`image(path)` の SVG の大きさ」）、画像の 1 画素あたりでは PNG と同じ約 8 バイトに当たる。書かれた大きさだけを変えた同じ SVG（ファイルはどれも 625 バイト）を file-viewer の image viewer で「収まる大きさ」に出して 10 秒後に測ると（0.1.14、コミット d90d726 の作り、2026-11-11、各 4 回）、1000 × 1000 は +30〜48 MiB、2000 × 2000 は +124〜185 MiB、4096 × 4096 と 8000 × 8000 はどちらも +510〜515 MiB だった（画像は 1 辺 8,192 px で止まり、出す大きさにはよらない）。4,000 × 4,000 px の PNG は +166〜185 MiB。閉じると絵の席の手放しで戻った（1000 × 1000・2000 × 2000 の SVG と PNG で 15〜62 MiB 残る回があったが、次に開くと消えた）。整形表示の図は、画面の外にあるものも全部読み込まれて残る: 873 × 252 の図を 10 個・40 個並べた文書を開くと、10 秒後に図 1 個あたり約 7.2 MiB 増え（全部の図を画像にした見積もりと合う）、最後までスクロールしても増えなかった（コミット d90d726 の作り、各 3 回）。app が見張らない場所（上の「app home の見張り」）に置いた絵は、タブを閉じても、ファイルを消しても放されない。図を SVG 画像で描く file-viewer（名前にタブの印を入れ app home 直下の `file-viewer-cache/` に置く作り）は、図 1 個を開くたびに約 3.5 MiB 増えて戻らず（図 100 個の文書で 1 回約 360 MiB、図 500 個で約 2 GB）、テーマを初めての色に替えるたび・拡大を初めての倍率に進めるたびにも、その絵の分だけ増えた（前に出した名前に戻るときは増えない）。図を部品で描く作りは、同じ手順で横ばいだった。何も表示しない別の mod のフォルダに置いて別の mod のタブで出した絵は、形式ごとに次のとおりだった（出すのをやめてから、同じ形式の 1 × 1 の絵を PowerShell の `[IO.File]::WriteAllBytes` で書いた。1 × 1 の絵は ffmpeg で作った png 90・jpg 221・gif 826・bmp 58・ico 113（png を包んだもの）・webp 34 バイト）: png・jpg・webp の 4,000 × 4,000 px は出すと約 185〜190 MiB、gif の 4,000 × 4,000 px は約 128 MiB、bmp の 2,000 × 2,000 px は約 35 MiB、ico（1 枚が 256 × 256 px までなので 200 枚）は約 148 MiB 増えた。出すのをやめただけでは増えた分の大半が残り（png・jpg・webp・ico は約 7 割、bmp は約 9 割、gif は全部）、1 × 1 で書き換えると、どの形式も書く前の値に戻った。4,000 × 4,000 px の bmp（48 MB）は描かれなかった（空白のままメモリが増えず、`status` の `errors` も空）。1 つのファイルの上限の 16 MiB（上の「`image(path)` の形式」）を超えているためと推測する。1 × 1 で書き換えてすぐ消しても、少し待ってから消しても、消して 5 秒後には放されていた（png は PowerShell の `WriteAllBytes` と `Delete` で、5 ms 後と 2 秒後。SVG の 2,000 × 2,000 px は mod の `fs.writeFile` と `fs.unlink` で、2 ms 後と約 3 秒後）。`mods/` の下では、書き換えずに消すだけでも放される（上の「消してから手放されるまで」）。100 枚の書き込み 71 ms、ごく小さい絵での書き直し 46 ms で、メモリは書く前に戻った。絵を出している mod が、このフォルダに文字のファイル（40 KB の base64 の文字列。`.b64` に当たるもの）を `fs.writeFile` で書き、5 秒後に `fs.unlink` で消しても、その mod のタブは読み直されなかった（モジュールを読み込んだ時刻と View を作った時刻が同じまま、1 秒おきの数が途切れず、`status` のエラーも無かった。上の絵の書き込みと消し方のあいだも同じ）。次の 3 つは playground で測った（0.1.14）。4,000 × 4,000 px の png は、`main.js` の無いフォルダで出して約 2 秒で約 +185 MiB、出すのをやめて 3 秒で約 +124 MiB だった（n=3）。出したままでも、読み込んでから約 10 秒で 57〜62 MiB 下がった（n=6）。2,000 × 2,000 px の SVG を 300 px の枠に出しても、同じく約 +185 MiB と約 +124 MiB だった（n=3。SVG は、出す枠でなく、SVG に書かれた大きさの縦横 2 倍の画像の分を使う。下の「`image(path)` の SVG の大きさ」）。付き添いの mod を使う作りでは、仕様の手順 (1)〜(4) の差が、直す前の作りの 221.8〜285.7 MiB から 50 MiB 以下（−18.5〜24.5 MiB。5 秒後の値）になった。[画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)の絵の席の作りでは 0.5〜14.5 MiB だった（10 秒後の値。コミット b941ae8 の時点の作りで、playground で測った（0.1.14）。そのあとの修正の作りでは測り直していない）。app の版が上がったら、仕様の確かめ方で測り直す（細かい手順と、直す前の作りと付き添いの mod を使う作りの値は、上の「確かめ専用の窓（playground）」の「メモリの測り方」）。image viewer の SVG を表示の大きさで書き直す作り（コミット 035f008）では、書かれた大きさ 8000 × 8000 の SVG を「収まる大きさ」（668 × 668 で書いた）で開いて 10 秒後は +13.3・+14.8・+14.5 MiB、一番拡大して（等倍が上限の 4,096 × 4,096 で書いた。そのときは約 700 MiB）から「収まる大きさ」に戻して 10 秒後は +12.8・+15.1・+15.3 MiB、閉じて 10 秒後は −1.5・−0.1・+0.6 MiB で、絵の席はどれもごく小さい絵だった（0.1.15、playground を起動し直した直後、2026-11-11、3 回。測る前に小さい SVG を 1 回開いて閉じ、その分は差に入れていない）。書き直す前の作りの +510〜515 MiB（上の 0.1.14 の値）から下がった |
| 画面の拡大率 | mod から画面の拡大率（DPI）を取る API は、`gpui-kit.d.ts` と `herdr.d.ts` に見当たらない（`window.viewport_size()` は描ける大きさだけ）。この機械の確かめ専用の窓は拡大率 1 だった。file-viewer は、図の SVG を出す大きさ（論理 px）と同じ大きさで書き出し、その大きさのまま出す（縮めて書き出した絵を引き伸ばさない） |
| SVG の大きさの決め方 | app が SVG を画像にする大きさは、usvg 0.46.0 の `Tree::size()` で決まる（`vendor/gpui-pre/src/svg_renderer.rs:275-283`。usvg はリポジトリに同梱されておらず、docs.rs の usvg 0.46.0 のソースで読んだ: `src/parser/converter.rs` の `resolve_svg_size`、`src/parser/units.rs` の `convert_length`、`src/parser/options.rs`）。根の要素の `width`・`height` を px に直す（単位なしと `px` はそのまま、`in` は 96 倍、`cm` は 96/2.54 倍、`mm` は 96/25.4 倍、`pt` は 96/72 倍、`pc` は 16 倍、`em` は文字の大きさ（既定 12）倍、`ex` はその半分）。無い側は 100% として扱い、`viewBox` があればその大きさ（% はその割合）。`width` か `height` が無いか % で `viewBox` も無いときは、描いた中身の外枠の右下までの大きさになる。`<style>` や `style` 属性では根の大きさは変わらない（`width`・`height`・`viewBox` は見た目の属性に入らない）。大きさが 0 以下や、根の要素が `svg` でないときは読み込みのエラーになる。`<image href>` の相対パスは app のプロセスの今いるフォルダから読まれる（`resources_dir` を渡していない）。ここまではソースを読んだもの。0.1.15 の playground で、大きさを指定しない `image(path)` に届いた大きさを見た（2026-11-11、各 1 回）: `font-size="20"` で `10em` × `5ex` は 200 × 50、`font-size="40"` と `style="font-size:10px"` の両方があると `style` の 10 px で `10em` × `4ex` は 100 × 20、`font-size="150%"` で `10em` は 180、`width="wide"`（読めない値）と `height="40"` と `viewBox="0 0 400 200"` は 400 × 40（読めない値は無いのと同じに viewBox の幅）。`width="300"` だけで viewBox の無い SVG は、書いた幅ではなく描いた中身の外枠の 200 × 100 になり、`height="80"` だけのものと `width="50%"` で viewBox の無いものも中身の外枠（150 × 50、310 × 160）だった。名前空間（`xmlns`）の無い `<svg>` と、`svg:svg` のように接頭辞の付いた根も描かれた。`width="100mm"` と `height="50mm"` は 377 × 188 が届いた（96 dpi で直した 377.95 × 188.98 の端数を落とした値と読める。確かめていない）。file-viewer の書かれた大きさの読み方（`lib/svg-root.js`）は、端数の扱いのほかはどれとも合った |
| `image(path)` の SVG の大きさ | 確かめ専用の窓の image viewer で、線と文字を 100 px おきに並べた SVG を「等倍」で出して撮った。1 枚の SVG は、長い辺が 8,192 px まで（400 × 4,096・400 × 8,192・8,192 × 400・4,096 × 4,096）はくっきり描かれた。400 × 9,000 は少し、400 × 10,000 はもう少しぼやけ、400 × 12,000・400 × 16,384・16,384 × 400 は縮めた画像を引き伸ばしたようにはっきりぼやけた（どれも空白にはならず、`status` の `errors` も空）。app は SVG を、出す枠の大きさによらず 1 回だけ画像にする。`image(path)` は倍率 1 を渡すが（`vendor/gpui-pre/src/elements/img.rs:741`）、GPUI は滑らかに描くためにそれを 2 倍にし、SVG に書かれた大きさの縦横 2 倍で画像にする（`vendor/gpui-pre/src/svg_renderer.rs:81`、`:116-120`、`:195-219`）。その画像の縦か横が 8,192 px を超えるとき、つまり書かれた辺が 4,096 px を超えるときは、両方が 8,192 px に収まるように縮める（`vendor/gpui-pre/src/svg_renderer.rs:270-293`）。配置の大きさは画像の大きさを 2 で割ったもので（`vendor/gpui-pre/src/assets.rs:90-93`）、書かれた辺が 4,096 px 以下なら書かれた大きさになる。書かれた辺が 8,192 px を超えると、画像は書かれた大きさより小さくなる。長い辺が 8,192 px を超えるとぼやけたのは、この縮め方に合う。file-viewer は、図の絵の辺が 4,096 px を超えると 4,096 px 以下のタイル（同じ絵の `viewBox` の切れ端）に分けて書き出し、隙間なく並べて出す。拡大の窓と `.mmd` の倍率は、書き出す絵の面積が 4,096 × 4,096 px に収まるところまでにする（大きな画像でメモリを使い切らないように。どこまで大きくしてよいかは測っていない） |
| `image(path)` の SVG の文字 | SVG の中の `<text>` は、Windows に入っている字体（Segoe UI・Yu Gothic UI・Meiryo など）で描かれる。Herdr が同梱する字体（mod の UI の字体の Geist、端末の JetBrains Mono）は使えず、`font-family` に指定しても、指定しなくても、明朝のような字体になる（`font-weight` の 400 と 600 も同じ）。`font-family="Segoe UI, Yu Gothic UI, sans-serif"` のように日本語の無い字体を先に並べて日本語を混ぜると、英数字まで等幅のように見える別の字体で描かれた（並べた 2 つ目の字体には移らない）。`"Yu Gothic UI"` だけにすると、英数字も日本語も Yu Gothic UI で描かれた。SVG の文字は、部品で描く文字より細く見える（部品の文字は色つきの縁取りで描かれ、SVG の文字は灰色の縁取り）。Yu Gothic UI の 13 px の文字の幅（同じ文字を 10 個並べた幅の 1/10）は、英数字が 2.7〜12.5 px（`i` 3.0、`n` 7.2、`m` 11.0、`M` 11.5、`W` 12.1〜12.5、数字 6.7〜7.5、`@` 12.2）、漢字 12.8、ひらがな 10.4、カタカナ 9.9、半角カタカナ 6.5、空白 約 3.1 px（太さ 600 は少し広く、最大で 0.9 px 増える）。file-viewer の図の文字の幅の見積もり（`lib/mermaid/layout.js` の `textWidth`）の元の作り（半角 0.55 em、全角 1.1 em）は、英字の見本「Round Start Hex Flag 0123 Yes?」で 214.5 px（Yu Gothic UI で 179 px）、日本語の見本「角丸 四角 判定 データベース」で 193 px（同 144 px）と広めだが、`m`・`w`・`M`・`W`・`O`・`@` などの広い文字だけの名前では狭すぎて、箱からはみ出しうる（どれも実機で確認） |
| `fs/promises` | `${appHome()}/...` の形（`/` 区切り）で app home の下の `mkdir` / `writeFile` / `readFile` / `readdir` / `exists` / `unlink` が使える。無いフォルダの `readdir` は例外になる（実機で確認）。`fs/promises` にあるのは `readFile`・`writeFile`・`readdir`・`exists`・`unlink`・`rmdir`・`mkdir` だけで、`fs.rm` は無い（`vendor/gpui-kit/crates/shell/src/typings.rs:3811-3823`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/standard/fs.rs:7-15`）。`mkdir` は `{ recursive: true }` で親のフォルダも作る。付けないと親が無いとき失敗する（os error 2）。`rmdir` は空のフォルダだけを消し、中身があると失敗する（os error 145）。中身ごと消すには自分でたどって消す。`readdir(path, { withFileTypes: true })` は `name` と `isDirectory()` を持つものを返す（`vendor/gpui-kit/crates/shell/src/engine/quickjs/host.rs:340-392`。どれも playground で 3 回ずつ確かめた（0.1.14））。小さいファイルを 1 つずつ続けて `fs.writeFile` すると 40 個で 26〜30 ms、80 個で 48〜52 ms、`fs.unlink` すると 40 個で 16〜20 ms、80 個で 37〜40 ms だった（それぞれ 3 回。playground で測った（0.1.14）） |
| `fs/promises` の `writeFile` | 文字列は書ける（UTF-8 で書く。先頭が U+FEFF の文字列を書くと、ファイルの先頭が `EF BB BF` になる）。0.1.14 では、`Uint8Array` を渡すとそのバイト列がそのまま書かれた（0〜255 の 256 バイトを書いて、256 バイトで中身も同じだった。3 回のうち 3 回）。`buffer` モジュールの `Buffer.from` で作った同じバイト列を渡すと、0 バイトのファイルになった（3 回のうち 3 回。どちらも playground で測った（0.1.14））。前に測ったときは `Uint8Array` も 0 バイトになった（そのときの版は記録していない）。0.1.15 では、`Uint8Array` を渡しても 0 バイトのファイルになった（playground で、file-viewer が WSL の画像を絵の席にコピーする `copyImage` の書き込みで見た。2026-11-11、PNG 1 つと SVG 2 つの 3 回のうち 3 回。どれも絵の席が 0 バイトになり、image viewer は空白だった。同じ版の文字列の書き込み（書き直した SVG）は書けた）。0.1.14 の結果と食い違う。どちらの版の振る舞いが続くかは確かめていない |
| `Buffer` / `crypto` | `Buffer.toString("base64")` は空文字列を返す。`createHash().update()` は文字列なら正しく、`Buffer` を渡すと空入力の値になる（実機で確認）。base64 への変換は `btoa`（Latin-1 の文字列のみ）を使う。`TextEncoder` は無い |
| 他 machine への書き込み | `exec` の引数で内容を渡す。上の Windows のコマンドラインの長さの上限が先に効くので、1 回に渡すのは引数としての長さで 24,000 文字程度に抑え（Linux の 1 引数の上限 128 KiB にも収まる）、一時ファイルへ追記して、最後に `mv` で置き換える。置き換える直前にディスク上のハッシュ（`sha256sum`）を比べれば、途中で外から書き換えられていたときに止められる。WSL へ約 416 KB を約 0.6 秒（実機で確認） |
| コピーができるとき | app は、選んでいるスペースの選んでいるタブの、見えているペイン（拡大しているときは拡大したペインだけ）にだけ mod のコピーを作り、そこで `init` を呼ぶ（`src/window.rs:1196-1213`、`:1433-1452`、`src/model.rs:143-156`、`:202-204`）。表示していないスペースのタブにはコピーができない。再起動で戻したタブも、選ぶまでコピーができず、`init` も呼ばれなかった（playground で測った（0.1.14）。n=1）。一度できたコピーは、表示していない間もペインがある限り残り、もう一度選んでも `init` は呼ばれない（`src/window.rs:1228-1275`、`:1433-1452`）。`panes()` は、コピーのできていないタブの mod のペインも並べる（props は付かない。`src/window.rs:1714-1723`） |
| 表示していないコピー | 表示していないコピーでも、`cx.timer.every` は間引かれずに動き続ける（`vendor/gpui-kit/crates/shell/src/engine/quickjs/scheduler.rs:618-621`）。`render` は呼ばれず、`cx.notify()` は描き直しの印を付けるだけで、次に表示したときの最初の描画で `render` が動く（`vendor/gpui-kit/crates/shell/src/view.rs:288-299`）。playground でも、隠している間に `timer.every` の回数は増え続け、`cx.notify()` を 8 回呼んでも `render` は 0 回だった（playground で測った（0.1.14）） |
| `cx.notify()` と描画 | `cx.notify()` のあと入出力を 1 回 `await` しても（file-viewer の `io.js` の `pauseForApp`。`fs.exists(appHome())` を待つ）、描画が済んだことにはならない。次はどれも playground で測った（0.1.14）。表示中のコピーで `cx.notify()` を呼んでから入出力の `await` を繰り返すと、1 回の `await` は 0〜1 ms で戻り、1 回目が戻った時点で `render` が動いていたのは 40 回のうち 0 回だった。`render` は、notify から 3〜18 ms（中央値 16.0 ms）後に 1 回動き、`await` を繰り返す側がそれに気づいたのは notify から 4〜19 ms（中央値 16.5 ms）後だった。notify を呼ばなければ `render` は動かなかった（10 回のうち 0 回）。表示していないコピーは上の行 |
| 閉じるときの呼び出し | `View.close(cx)` は、コピーのペインがなくなるとき（タブ・ペイン・スペースを閉じる、props が変わる）と overlay が消えるときに、そのコピーに 1 回だけ呼ばれる。表示していないタブのコピーでも、一度できていれば呼ばれる。閉じるのを止める手段は無い（型定義と AGENTS.md）。締め切りは 250 ms で、`close` が返した Promise をそこまで待ち、過ぎたら JavaScript を打ち切る（`src/window.rs:1302-1308`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/lifecycle.rs:44-100`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/sandbox.rs:498-503`）。一度もできていないコピー（上の「コピーができるとき」）には呼ばれない。AGENTS.md の「表示していないコピーや非アクティブなタブには呼ばれない」は、このことを指すと推測する。app を終えるときと窓を閉じるときは、すべてのコピーに 1 つの 250 ms の締め切りを共有して順に呼ぶ。この道では、`fs/promises`・プログラムの実行・`fetch` の Promise は決着せず、進むのは `herdr` モジュールの async 関数と `cx.sleep` だけ（`src/main.rs:166-178`、`src/window.rs:557-570`、`:1310-1317`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/lifecycle.rs:104-114`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/scheduler.rs:1349-1404`。進むほうは `vendor/gpui-kit/crates/shell/src/engine/quickjs/scheduler.rs:494-512`、`:1222-1275`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/host_modules.rs:137-151`）。プロセスを強制終了したときは何も呼ばれない。hot reload では呼ばれない。新しいコードを読み込んで `init` してから、古いコードの非同期処理を止める。これは 1 つの同期の処理の中で続けて行う（`vendor/gpui-kit/crates/shell/src/watch.rs:547-579`）。表示中のタブを `tab.close` で閉じたときに呼ばれ、その中の `fs/promises` の書き込みが終わることは実機で確認した。`close()` の中で、40 個と 80 個のファイルを 1 つずつ続けて `fs.writeFile` で書き換え、最後に印のファイルを書くと、どれも書き終わり、`close()` が始まってから 40〜60 ms で終わった（40 個と 80 個を 3 回ずつ。playground で測った（0.1.14）） |
| `check` | `init` の中で始めた非同期処理（`cx.spawn`）は、最初の `await` までは `init` の中で続けて動くが、その先は動かない（`check` は最初の描画の結果を出すとすぐ終わる。`vendor/gpui-kit/crates/shell/src/host.rs:514-562`、`vendor/gpui-kit/crates/shell/src/plugin.rs:1351-1356`）。非同期の動きは実機で確かめる。初回描画に時間がかかると `interrupted` で失敗する（数十万文字を 1 文字ずつ数える処理を `render` で何度も呼ぶと起きた） |
| 描画の時間 | `render` の中の処理が長いと、その描画は `interrupted` で失敗し、窓には「This view could not be re-rendered; showing the last version that worked」と前に描けた中身が出続ける。同じ内容を描き直すたびに同じ処理をするなら、ずっと進まない。時間の上限は、描画と配置の 1 回が 50 ms、イベントと非同期処理の 1 区間が 500 ms（`vendor/gpui-kit/crates/shell/src/engine/quickjs/sandbox.rs:436-444`、`:504-517`）。打ち切られた描画は、前に描けた中身と帯（初めての描画なら、重ねて出す表示）を出したまま、自分では描き直さない。もう一度 `cx.notify()` などで描き直しを求めるまで、そのまま（`vendor/gpui-kit/crates/shell/src/view.rs:231-331`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/mod.rs:3178-3190`）。file-viewer の Markdown の画像の書き換えが下の `matchAll` を使っていたときは、約 9,300 文字の文書は通り、約 13,900 文字で止まった（止まったのは実機で確認。quickjs-emscripten で測ると書き換えは 74 ms と 106 ms）。`exec` に変えたあとは、同じ 13,900 文字の書き換えが quickjs-emscripten で約 16 ms |
| 描画の中の整形の準備の大きさ | 区切りながら準備する作りより前の版の file-viewer の整形の準備（当時は `markdownBody` が描画の中で、参照形式の定義の収集、` ```mermaid ` の境目での分割、画像の書き換え、図の解析と配置をする）を初回描画でする mod を `check` に通し、大きさを変えて、interrupted にならない最大を探した（境目の前後は 3〜4 回ずつ）。画像やバッジの多い文書（1 節が、見出し、インラインコードとリンクと `![]()` を含む段落、`<p align="center"><a href><img></a></p>` の HTML のかたまり、参照形式のバッジのリンクと `<a href><img></a>` の段落、3 行の `sh` のコードブロック。末尾に参照形式の定義が 2 つ）は、180 節（46,559 文字、59,519 バイト）がいつも通り、185 節・190 節（47,869 文字・49,179 文字）は通ったり interrupted になったりし、195 節（約 50,500 文字）からはいつも interrupted だった。図だけを並べた文書（1 つの図は `flowchart TD` のノード 6 個・辺 6 本、うち 2 本にラベル）は、6 個がいつも通り、7 個は 3 回のうち 1 回だけ通り、8 個からはいつも interrupted だった。同じ文書の準備は quickjs-emscripten で、180 節が約 47 ms、図 6 個が約 42 ms（図の要素を組み立てる時間は含まない）。`check` は、interrupted になる文書でもそうでない文書でも約 0.75 秒で終わった。実機の窓で file-viewer に開くと、同じ作りの 180 節の文書は整形表示が出て、200 節（51,799 文字、66,199 バイト）は interrupted で「読み込み中…」のままだった（`check` と同じところで分かれる）。ここまでは、その前の版（`markdownBody` が描画の中で一度に準備する作り）で測った値。区切りながら準備する作り（`lib/prepare.js` を描画の中で最後まで進める）で同じように測り直すと、画像やバッジの多い文書は 165 節（42,629 文字、54,509 バイト）がいつも通り（5 回）、170 節・175 節は通ったり interrupted になったりし、180 節からはいつも interrupted だった。図だけを並べた文書は 7 個がいつも通り（6 回）、8 個からはいつも interrupted だった。ここまでは `check` で測った値。図を SVG 画像で描く作り（描画の中では準備までで、SVG の書き出しは描画の外）で、確かめ専用の窓で開いて測り直した（描画の外で準備する大きさを大きくした版を入れ、開いてから続けて撮った画面に「This view could not be re-rendered」「interrupted」の帯が写るかで見た。`herdr-app status` の `errors` は、描画が打ち切られても空のままだった）。画像やバッジの多い文書（上と同じ節）は、100 節（25,599 文字）が 4 回、110 節（28,219 文字、36,139 バイト）が 3 回とも通り、115 節は 3 回のうち 1 回、120 節は 4 回のうち 3 回、140 節は 1 回のうち 1 回 interrupted になった。図だけを並べた文書（上と同じ図）は、3〜5 個がどれも 3 回とも通り、6 個は 4 回のうち 3 回、8〜12 個はどれも interrupted になった（`check` より小さい。窓の描画の時間の余裕が `check` より少ないと推測）。file-viewer の描画の外で準備する大きさは、いつも通った最大の半分を切り下げた 14,109 文字・図 2 個にする |
| 整形表示の部品の重さ | 図の無い Markdown（1 節が、見出し、インラインコードとリンク 2 つの段落、3 行の表、3 行の `js` のコードブロック、リンクを含む 2 項目のリスト）を、整形の準備をせずに 1 つの `TextView.markdown` にして、ボタンで表示してからホイールでスクロールした。押してから画面が変わり終わるまでと、ホイールを送ってから画面が変わるまでを、画面の一部を約 11 ms おきに撮り続けて測った。開く時間は、128 KiB（130,794 バイト）で約 0.33 秒、192 KiB（128,727 文字、196,351 バイト）で 0.69〜0.77 秒、224 KiB（150,311 文字、229,153 バイト）で 0.89〜0.90 秒、256 KiB（171,966 文字、262,026 バイト）で 0.84〜1.06 秒（3 回のうち 2 回が 1 秒以上）、288 KiB・320 KiB で 1.2〜1.3 秒だった。この部品を表示している間は、窓を描き直すたびに同じだけ時間がかかるらしく、ホイールへの反応は 128 KiB で約 0.15 秒、192〜256 KiB で 0.3〜0.85 秒だった（ほかのタブの動く印などで窓が描き直され続けているときに測った）。図だけを並べた Markdown（図は上の行と同じ）で配置を済ませた図を描くと、100 個までは開くのが約 0.1 秒・ホイールへの反応が約 0.04 秒で止まらなかったが、描画の中で図の要素を組み立てる時間で、106〜109 個は描けたり interrupted になったりし、112 個からはいつも interrupted で描けなかった。ここまでの図の数は、図を箱・線・文字の部品で組み立てて描いていた版（SVG 画像で描く前の版）で測った値。図を SVG 画像で描く作りで、確かめ専用の窓で測り直した（図は上と同じ。整形表示の上限の図の数だけを大きくした版を入れ、開いて整形表示になってから 3 回ホイールを送り、送ってから画面が変わるまでを約 45 ms おきに撮って測った。開く間は、0.45 秒おきにツールバーのボタンにマウスを載せ外しして、見た目が変わるまでを測った）。100・200・400 個は、スクロールへの反応が 0.12〜0.18 秒。500 個（82,577 文字、117,589 バイト）は、開いた直後の 3 回と、整形表示の上限のすぐ下の画像の多い文書を開いて閉じたあとの 2 回のどれも整形表示になり、スクロールへの反応は 0.12〜0.20 秒、開く間のマウスへの反応は最も長くて 0.26 秒（3 回）だった。開いてから整形表示になるまでは、操作を送る道具の時間を含めて約 9〜11 秒（整形の準備の 10 秒の上限に近い）。600 個と 800 個は止まりはしないが、整形の準備（図の配置と SVG の書き出し）が 10 秒を超えて、代わりの整形表示になった。file-viewer の整形表示の上限は、1 秒以上止まらず整形表示になった最大の測定点の、229,153 バイトと図 500 個にする。この値にした版で図 500 個の文書を開くと、整形表示になり、スクロールへの反応は 0.11〜0.17 秒で、先頭・図 118 のあたり・末尾（図 500）のどの図もノードの名前（ひし形の「入力はある？」、丸の「終了 N」を含む）が全部出た。図 501 個の文書はソース表示で開き、上限の帯が出た。同じ文書の上で比べると、整形表示の上限（150,311 文字、図 500 個）は描画の外で準備する大きさ（14,109 文字、図 2 個）より大きいので、描画の外の準備が使われる |
| file-viewer の大きな Markdown（実機） | 区切りながら準備する作りの file-viewer で、開いたあと 250 ms おきにホイールを送り、画面が変わるまでの時間を測った。図の無い節と画像の多い節を交互に並べた 219,540 バイトの文書は、開くときに最も長くて 0.45 秒、スクロールで 0.21〜0.33 秒。見出し・表・コードブロック・リンクの 228,691 バイトの文書（整形表示の上限のすぐ下）は、開くときに最も長くて 0.6 秒、スクロールで 0.37〜0.74 秒（1 秒は超えないが、余裕は少ない）。見出しと段落と図を 100 組並べた文書は、「整形中…」のあと整形表示になり、スクロールで約 0.05 秒。画像の多い 46,559 文字の文書は「整形中…」のあと整形表示になり、開いたまま 2 秒おきに追記すると、「整形中…」に戻らずに差し替わり、スクロールの位置（末尾）も保たれた。図 100 個の文書は、mod の実行環境のメモリを使い切りかけていたときに「Null"null"」で描けなくなったことがある（下の「メモリ」）。再起動のあとは描けた。スクロールの位置をコピーが持つ形（下の「表示していない間の部品の状態」）にしたとき、整形表示の上限のすぐ下の、見出し・表・コードブロック・リンクの 228,690 バイトの文書で、ホイールを送ってから画面が変わるまでを、同じ playground に入れ直しながら順に測ると、この形で 0.90〜1.03 秒（9 回）、app の部品でスクロールさせる前の版で 0.94〜1.17 秒（6 回）、もう一度この形で 1.17〜1.31 秒（6 回）だった（入れ直す前の、前の版の最初の測定は 0.87〜0.91 秒。入れ直しを重ねるほど遅くなり、playground のメモリが減っていくためと推測する。この作りの前の測定の 0.37〜0.74 秒より遅く、どちらの形でも 1 秒を超えた。2 つの形の差は、この測り方では見分けられなかった）。13,930 文字の文書と図 100 個の文書では、どちらの形でも 0.10〜0.13 秒。上限のすぐ下で 1 秒未満に収まるかは、この playground では確かめられず、再起動したあとに 2 つの形を測り直す |
| 中身の差し替えとスクロール | 整形表示を少し下までスクロールしてから、部品の要素の id を変えずに中身を差し替えると（1 つの `TextView.markdown` でも、文章と図を並べた file-viewer の整形表示でも）、スクロールの位置は保たれた |
| 表示していない間の部品の状態 | `overflow_y_scrollbar()` でスクロールさせた file-viewer の整形表示を下までスクロールし、別のタブを選んでから戻ると、先頭に戻った（図の無い 13,930 文字の文書と、図 100 個の文書）。同梱の `files` のツリー（同じ `overflow_y_scrollbar()`）も、パネルを閉じて開くと先頭に戻った。戻った直後には、整形表示の本文（`TextView.markdown`）が空の 1 フレームが写ることがあった。View のインスタンスは残る（読み込み直しも「読み込み中…」も無い）。表示していない間は `render` も呼ばれなかった。ここから、表示していない間に app がそのタブの部品の状態（スクロールの位置、`TextView` の中身）を捨てていると推測する。型定義には、`overflow_*_scroll` の場所のスクロールの位置を読み書きする API が無い（`VirtualListScrollHandle` の `scroll_to_item` / `scroll_to_bottom` は仮想リスト用で、リストの行の中には `on_click` などを付けられない）。file-viewer の整形表示は、スクロールの位置をコピーが持ち、`overflow_hidden()` の枠の中で本文を `absolute().top(-位置)` で出し、`on_scroll_wheel` で動かす（同梱の `picker` と同じ形）。つまみは `Slider` を縦にして、ドラッグと溝を押すことで動かす（下の「スクロールバー」）。この形で、戻ったときにもとの位置で出ることと、ソース表示から戻ったときも前の位置で出ることを確かめた（どれも実機で確認）。この形でも、戻った直後に本文が空の 1 フレーム（約 0.1 秒）が写ることがある。上に書いたとおり、位置をコピーが持つ形にする前の `overflow_y_scrollbar()` の作りでも写っていた（実機で確認）。表示していない間に app が部品の描いた中身を捨て、戻ってから描き直すまでの間だと推測する。ソース表示から入るときと違い、タブに戻るときには先に出していた表示が無いので、mod はこのフレームを重ねて隠せない |
| スクロールバー | app のスクロールバー（`overflow_y_scrollbar()` の Files のツリー・サイドバーのスペースの一覧、Editor）を、確かめ専用の窓で撮って測った。つまみは幅 6 px で、場所の右端から 4 px 内側、上下の端からも 2〜4 px 内側にある。色は、背景に関わらず文字の色（`theme()` の `foreground`）を約 35% 重ねた色と一致した（graphite で `#17191d` の上に `#626366`、`#101114` の上に `#5d5e60`、paper で `#ffffff` の上に `#afafb0`）。つまみにマウスを載せると、右端を保ったまま幅 8 px に広がり、文字の色を約 55% 重ねた色になる（graphite と paper の両方で、file-viewer のつまみと同じ色に写った）。つまみの長さは場所と中身の高さの比で決まり（Files のツリーで 688 px の場所に 176 px）、866 行の文書の Editor では 40 px だった（比で決めると約 24 px なので、下限が 40 px ほどあると推測する）。出し入れ（`mode` を付けない、テーマに従う既定）は、スクロールすると出て、最後のスクロールから約 2 秒で消えた（約 45 ms おきに撮って、薄れていく途中のフレームは写らなかった）。消えている間にスクロールバーの場所やつまみの場所にマウスを載せても出ない。出ている間につまみにマウスを載せると、2 秒たっても出たまま。`theme()` にスクロールバー専用の色の名前は無い。file-viewer の整形表示のつまみ（`Slider`）は、この幅・位置・色・長さ（下限 40 px）・出し入れに合わせ、並べて撮って同じ色と幅に写ることを確かめた（どれも実機で確認）。file-viewer は、つまみにマウスが載っているかを、スクロールバーの帯（広がったつまみの幅の 8 px）の `on_mouse_move` で知ったマウスの位置と今のつまみの位置で決め、帯の `on_hover` で離れたことを知る。file-viewer がマウスの位置を知るのはマウスが帯の上で動いたときだけなので、つまみに載せたまま別のタブに替えて `POLL_MS`（2 秒）より長く隠してから戻り、マウスを動かさずにいると、載っていることが分からず、最後のスクロールから 2 秒で消えると推測する（確かめていない）。file-viewer は、タブが隠れたことに `POLL_MS` おきのタイマーで気づいて本文で覚えている操作の印（つまみに載せている印、本文で押している印）を解く。2 秒より早く戻ると、隠れている間にタイマーの回が来ないことがあり、そのときは印が解けずに残ることを playground で確かめた。残った印は次にマウスの知らせが来るまで効き、スクロールバーが出たままになったり、押していないのに端の帯で本文の自動スクロールが始まったりすることがある。`gpui-kit.d.ts` には `render` から呼べる `window.mouse_position()`（窓の中のマウスの位置）が宣言されているが、file-viewer は使っておらず、タブに戻った最初の描画で今の位置を返すかは確かめていない |
| 選びながらのスクロール | file-viewer の整形表示（`overflow_hidden()` の枠の中で本文をずらして出す形）で、本文の中で左ボタンを押してから上下の端に動かした。`on_mouse_move` は押しているボタンを知らせないが、枠の `on_mouse_down("left")` は `selectable(true)` の `TextView.markdown` の上で押しても届いた。枠で押している間を覚え、端から 32 px の帯に来たら、`cx.spawn` の中で入出力の `await` を挟みながら位置を進め続けると、本文は下へも上へもスクロールし続けた。選んでいる範囲（`TextView` の選択）は、部品がマウスの動きを受けたときに、そのときマウスの下にある文字まで伸びた。マウスを止めたままにすると、本文はスクロールしても範囲は伸びず、最後に動かしたときの文字で止まったまま本文と一緒に流れた。止めたまま離しても伸びなかった（`PostMessage` で押す・動かす・離すを送って撮った。どれも実機で確認）。mod から部品にマウスの動きを送る手段や、選択の範囲を書き換える API は型定義に見当たらないので、止めたままの間を伸ばすことはできない。`on_mouse_move` と `on_mouse_up` は要素の上にある間しか届かないので、本文の外に出たら止める（外に出てもスクロールし続ける app の作りとは違う） |
| 整形表示の部品の作り直し | 新しく描画の木に置いた `TextView.markdown` は、中身を描くまでの数フレーム、高さ 0 の空のまま描かれる（13,930 文字の文書で、ソース表示から整形表示に切り替えると、本文の空いた画面が約 0.2 秒・3 フレーム写った）。部品を包む `div` に `on_size_change` を付けると、空の間は高さ 0、中身を描くと中身の高さが届く。file-viewer は、ソース表示・「整形中…」・「読み込み中…」から整形表示に入るとき、文章の部分のどれもが高さを持つまで、入る前の表示を本文の上に重ねて出す。この形で、ソース表示から整形表示と「整形中…」から整形表示（46,559 文字の画像の多い文書）の間に、空のフレームは写らなかった（約 45 ms おきに撮った。どれも実機で確認） |
| 整形の準備を区切る時間 | file-viewer の区切りながらの準備（`lib/prepare.js`。かたまり 1 つ分の定義の収集、かたまり 1 つ分の画像の書き換え、図 1 個の解析と配置を単位にする）を quickjs-emscripten で測った。図の無い節と画像の多い節を交互に並べた整形表示の上限の大きさの文書（162,634 文字、229,104 バイト）は、一度に進めると 154 ms、1 単位は最も長くて 7 ms、100 ms の予算で区切ると 2 区間で、1 区間は最も長くて 100 ms。同じ文書に図を 100 個混ぜたもの（229,055 バイト）は、一度に進めると 844 ms（ほとんどが図の配置）、1 単位は最も長くて 10 ms、100 ms の予算で 9 区間、1 区間は最も長くて 105 ms。大きさの判定（`lib/render-size.js` の `judgeSize`。UTF-8 のバイト数は `unescape(encodeURIComponent(text)).length` で数える。1 文字ずつ数えると 1 MiB で約 45 ms、この形なら約 10 ms）は、整形表示の上限の大きさで約 7 ms、1 MiB の文書で 10〜14 ms（app の QuickJS でも、`check` の中で測って同じくらい） |
| `matchAll` | 呼ぶたびに正規表現を作り直す（仕様どおりの複製）。quickjs-emscripten で、リンクを拾う大きな正規表現なら 1 回 約 0.1 ms かかり、短い文字列に何百回も当てると、照合よりこちらが重い。`exec` を繰り返せば作り直さない。描画の中で何度も呼ぶ処理では `exec` で集める（`lib/markdown.js` の `matchesOf`） |
| モジュールのトップレベルと実行環境 | mod の JavaScript の実行環境（QuickJS）は窓ごとに 1 つで、その窓のすべての mod とコピーが使う。メモリの上限は 256 MiB（`src/window.rs:464`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/sandbox.rs:407-409`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/mod.rs:1726`）。mod のモジュールのトップレベルは、同じ実行環境の中で、同じ版のコードにつき 1 回だけ動き、その mod のすべてのコピー（タブのコピーと overlay のコピーを含む）で共有される（`vendor/gpui-kit/crates/shell/src/engine/quickjs/mod.rs:2202-2225`。CHANGELOG.md の 0.1.14 にも、トップレベルは 1 回だけ動いてすべてのコピーで共有され、コピーごとの状態はクラスに持つ、とある）。overlay は、タブのコピーとは別のコピーとして作られる。次はどれも playground で測った（0.1.14）。タブの 2 つのコピーと overlay のコピーは、同じ 1 回の評価のモジュールを使った（3 回のうち 3 回）。すべてのコピーを閉じて開き直しても、同じ評価を使った（3 回のうち 3 回）。例外が 2 つあった。1 つは、初めて開いたときにモジュールが 2 回評価されたこと（2 つの mod で 2 回のうち 2 回。コピーは 2 回目のものを使った）。もう 1 つは、`mods/` 直下にフォルダを作って消したあとに開いたコピーが、新しく評価したモジュールを使い、すでに開いていたコピーは前のモジュールのままだったこと（2 回のうち 2 回）。hot reload では、すべてのコピーが新しいモジュールで `init` し直し、モジュールの中の状態は引き継がれなかった（3 回のうち 3 回）。`globalThis` は窓に 1 つで、すべての mod とすべての版で共有され、hot reload のあとも残った（実行環境ごとに 1 つの文脈を作る。`vendor/gpui-kit/crates/shell/src/engine/quickjs/mod.rs:1691`、`src/window.rs:464`） |
| 窓と app home | mod の API に窓の id は無い。`window()` が返すのは `platform`・`titlebar`・`buttons`・`maximized`・`fullscreen`・`active` だけ（`defaults/herdr.d.ts:250-257`）。1 つの app home で動く herdr-app のプロセスとメインの窓は 1 つで、同じ app home でもう一度起動すると、動いている窓を前に出して終わる（`src/control.rs:15-24`、`:56-60`、`src/main.rs:99`、`:202-227`）。そのため、メインの窓が 2 つあれば、それぞれ別の app home で動いている |
| メモリ | mod の JavaScript は QuickJS-ng で動く（app の中の文字列から）。`check` の中で 1 MiB の文字列を作り続けると、約 252 MiB で `out of memory` になった（上限は 256 MiB。上の「モジュールのトップレベルと実行環境」）。動いている app で、file-viewer を動かしている実行環境（窓のほかの mod と共有）がメモリを使い切ると、表示中のタブに「This view could not be re-rendered」と `Null"null"`、新しいタブに「file-viewer did not load: Null"null"」が出て、保存で読み直しても `herdr-app status` に `reloading ...: out of memory` が出て読み込めなかった（前の版のファイルに戻しても同じ。`check` は通る）。再起動で戻った。file-viewer に、確保できる量（1 MiB の文字列を作り続けて数える）を記録させて測ると、コピーを 1 つ作るたびに約 1 MiB 減り、mod のファイルを保存して読み直すたびに、開いているコピーの数だけ（タブ 7 つで約 7 MiB）減って戻らなかった（前の版の file-viewer で測定。何もしない 30 秒の間は減らなかった）。読み直しを何十回も繰り返すと、使い切りうる。この測定では、同じ mod のタブのコピーがそれぞれモジュールを読み込み直していた（モジュールのトップレベルの値がコピーごとに別だった）。0.1.14 では、ソースでも playground でもトップレベルはコピーの間で共有されるので（上の行）、この測定は 0.1.14 より前の app でしたものと推測する。コピーごとと読み直しごとに減る量は、0.1.14 では測り直していない（CHANGELOG.md の 0.1.14 は、mod のメモリが少しずつ埋まって、どの mod も「This view could not be re-rendered」になる不具合を直したと書いている）。文字列を作るだけでは循環参照の回収が走らない可能性があり、回収されないごみか本当に解放されないものかは見分けていない |
| `cx.spawn` の始まり | `cx.spawn(async (cx) => ...)` に渡した関数は、最初の `await` までは呼んだその場で続けて動く。`render` の中で spawn すると、そこまでは描画の中で、そこで `cx.notify()` を呼ぶと「cx.notify() is not allowed during the `render` phase」の例外になる（実機で確認）。描き直しを求める非同期処理は、先に入出力を `await` してから `cx.notify()` する |
| 図の配置の再帰の深さ | mod の実行環境のスタックは浅い。初回描画で、縦に 1 本につながった flowchart（`N0-->N1-->…`）を配置する使い捨ての mod を `herdr-app check` に通すと、30 ノードは通り、40・50・60・90・121 ノードは「thread 'main' has overflowed its stack」で `check` の処理ごと落ちた（終了コード 253。同梱の dagre のグラフをたどる再帰が深くなる。1 つのノードから分かれて戻る図は 400 ノードでも落ちず、時間切れの interrupted になった）。確かめ専用の窓で、121 ノードがつながった図 1 個の文書を開くと、窓のプロセスごと落ちた。main の版の file-viewer（同じ dagre）でも `check` で同じに落ちた。再帰を自前のスタックで回す形に直した dagre では、40・121・400 ノードとも落ちず、interrupted になった。スタックの上限は JS の例外（RangeError）にならずにプロセスが落ちることがあるので、深さが入力の大きさで増える再帰を mod に置かない。`herdr-app check` は別のプロセスで動くので、落ちるかもしれない処理は、窓で開く前に `check` で確かめられる |
| 長い同期処理 | `cx.spawn` の中で、`await` を挟まずに続けて動く区間が約 0.5 秒を超えると、その非同期処理は黙って止まる（続きが動かず、例外も `status` の `errors` も出ない。500 ms の空回しは通り、550 ms で止まった）。`await` を挟めば、全体で 0.5 秒を超えても続く。ただしマイクロタスク（`await Promise.resolve()`）では区切れず止まる。`fs/promises` の `exists` / `readdir` などの入出力を `await` すると区切れる（実機で確認）。上限は、非同期処理の 1 区間の 500 ms。入出力を待って戻ると新しい区間になり、マイクロタスクの `await` では新しい区間にならない（`vendor/gpui-kit/crates/shell/src/engine/quickjs/sandbox.rs:436-444`、`:504-517`、`vendor/gpui-kit/crates/shell/src/engine/quickjs/scheduler.rs:810-846`）。重い処理は 1 区間を数百 ms に収め、間に入出力の `await` を挟む。file-viewer の描画の外の整形の準備では、図 1 個の解析と配置が区切れない 1 単位になる。再帰を自前のスタックで回す形に直す前の dagre（上の「図の配置の再帰の深さ」）のまま、quickjs-emscripten（0.31.0）で `layoutMermaid` を測ると、1 本の連鎖の `flowchart TD`（`N0-->N1-->…`）は 46〜48 ノードで約 50 ms、206 ノードで約 0.29 秒で、208 ノードからはスタックが溢れて（配置の中の再帰が深くなる）、約 0.15 秒でその図の失敗（「1 行目の文法エラー」）になった。スタックの上限を外すと、300 ノードで約 0.49 秒、310 ノードで約 0.51 秒。1 つのノードから分かれて 1 つのノードに戻る図（`R-->Ni-->Z`）はスタックが溢れず、間のノード 30 個で約 41 ms、250 個で約 0.46 秒、270 個で約 0.52 秒。確かめ専用の窓で `.mmd` を開くと、この形の図は 200 ノードは出たが、270 ノードと 400 ノードは図 1 個の配置の 1 単位のまま非同期処理が止まり、10 秒後に描けない図の「図の準備が終わらなかった」になった（スタックが溢れたのか、0.5 秒を超えて止まったのかは見分けていない）。200 ノードの図は、確かめ専用の窓で配置の 1 区間が 454〜482 ms かかり、16 回開いて 3 回、その区間から戻らずに止まった（区間に入ったまま、続きも `finally` も動かなかった）。file-viewer の見張りは、区間の外でしか動かないので、区間が残っていれば止まったと見なし、10 秒を待たずに準備を始めからやり直す（止まってから気づくまでの間も 10 秒に数える）。この形にしてから 200 ノードの図を 12 回開くと、すべて図が出た（11 回は約 1.6 秒、止まってやり直した 1 回は約 3.5 秒）。270 ノードの図は、やり直しを続けて約 11 秒で「図の準備が終わらなかった」になった |
| UTF-8 の判定の時間 | file-viewer の、base64 で運んだバイト列の判定（`lib/utf8.js`）は、QuickJS 上で base64 の 20 万文字に約 75 ms。1 MiB 近いファイル（base64 で約 139 万文字）を続けて確かめると 0.5 秒を超えて止まるので、25 万文字ずつ入出力の `await` を挟んで確かめる。WSL から `base64 -w0` で約 1 MB のファイルを運ぶのは約 70 ms（実機で確認） |
| SVG の根の読み書きの時間 | file-viewer の SVG の根の要素の読み書き（`lib/svg-root.js`。根を読むときに、`<style>` 要素の有無も全文から探す）を、quickjs-emscripten（0.31.0）で 6,000,000 文字の SVG の文字列に当てて 5 回ずつ測った（コミット 6584ece の作り、2026-11-11）。根が先頭にあり本文が ASCII のもの、本文に日本語を混ぜたもの、根が約 6 MB のコメントの後ろにあるもの、要素ごとに `style` 属性を持つもの、本文の終わりに `<style>` 要素があるもので、根を読むのは 4〜17 ms（`<style>` 要素が先頭近くにあれば 0 ms）、根の width・height を書き換えた全文を作るのは 0〜3 ms、タイルの全文は 0〜4 ms だった。要素ごとに `a:style="…"` のような接頭辞の付いた属性を持つように作った文字列は、探して見つかる所が多く、根を読むのに約 61 ms かかった。`<style>` 要素の有無を全文に正規表現（`/<(?:\w[\w.-]*:)?style[\s/>]/`）で探す作りでは、`<style>` 要素が先頭近くにない文字列で根を読むのに 50〜68 ms、`style` 属性も数える正規表現の作り（コミット 1063fae）では、`style` を含まない文字列で 93〜116 ms かかった。同じ文字列で、U+FFFD を探す（`includes`）のは 3〜8 ms、同じ中身の別の文字列と比べるのは 1〜3 ms。どれも描画の外の準備の 1 区間（100 ms ほど）に収まるので、これらは区切らずに 1 回で動かす |
| 保存する内容を作る時間 | file-viewer の改行の書き戻し（`lib/save.js` の `preserveLineEndings`）を QuickJS 上で測った。約 370 KB に 1 行の書き換えで 15 ms、1 MiB に 1 行で 35 ms（Editor が CRLF をそのまま返す形なら 3 ms と 5 ms）。1 MiB の 100 行に 1 行・30 行に 1 行・全行の書き換えで 73 / 109 / 94 ms、短い行が 5 万〜40 万行で多くを書き換えたときも 14〜134 ms（実機で確認） |
| `EditorState` | `set_value()` で内容を変えても `"change"` は呼ばれない。`soft_wrap` などのオプションを後から変えるメソッドは無いので、内容を引き継いで作り直す。`EditorState.new({ value })` の `value()` は、渡した改行（LF / CRLF とその混在）と末尾の改行をそのまま返す（`check` で確認）。実際の窓で Enter を押したときに入る改行は未確認 |
| `herdr-app shot` | 窓が描き直されない間は、最後に描いたフレームを返し続ける（作業中に数十分続いたことがある。最小化などの原因は未確認）。続けて撮った PNG がまったく同じなら、表示の確認には使えない |
| mod の追加 | `mods/<name>/` を置いた直後は `tab.new {mod}` が `no mod "<name>" in mods/` で失敗することがある。数秒おいて再試行すると通る |

## Orca 並みのビューアに向けた見通し

Orca は Electron（Web 技術）製なので、UI 部品はそのまま持ち込めない。ロジック（diff の計算、行の対応付け）は JS なので移植できる。

- **file viewer**: ツリー + `Editor`（readonly）で実用水準に届く。同梱 `files` の弱点（パネル内でツリーと表示が排他、ファイル上限、検索なし）は自作で解消できる範囲。
- **diff viewer**: 専用部品は無い。`v_virtual_list` の行を自前で組み立て、行ごとに背景色を付ける（同梱 `changes` と同じ方式）。side-by-side は「1 行に左右 2 列を持つ 1 本のリスト」にすると左右の行がずれない。2 本のリストを同期スクロールさせる方式は難しい。diff 行内の構文色付けは JS 側でのトークン分割が必要。
- **changes**: 一覧、stage / unstage、部分的な操作は `exec` の git で組める。WSL の space では変化検知がポーリングになる。

## 未検証事項

- `\\wsl.localhost\...` への symlink / junction を `mods/` に置いて、リポジトリを直接読ませられるか
- gpui-shell のバイナリ内に、`package.json` 経由で Git 依存を解決する仕組みの文字列がある。herdr-app の mod で使えるか、マニフェストの形は未確認
- バイナリ内の `gpui-shell.json`（`capabilities.network` / `capabilities.fs` を持つマニフェスト）は gpui-shell 単体のもので、herdr-app の mod は AGENTS.md 上「制限なし」とされている。herdr-app の mod に効くかは未確認
