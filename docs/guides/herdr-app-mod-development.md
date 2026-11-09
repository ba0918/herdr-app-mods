# herdr-app mod 開発ガイド

herdr-app の拡張（mod）がどう動くかと、この環境（Windows の herdr-app + WSL の作業領域）で mod を作って組み込むまでの手順をまとめたガイド。
API の網羅的な説明は herdr-app 自身が生成する一次情報に任せ、ここでは「何を読めばよいか」「この環境で何が違うか」「どう作ってどう確かめるか」を扱う。

調査時のバージョン: herdr-app 0.1.13（`herdr-app --version`）。app の更新で API が変わりうるので、作業前に一次情報を読み直すこと。

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
- mod フォルダ内のファイルを保存すると、表示中のコピーがその場で **hot reload** される。壊れた保存は前の版が動き続け、エラーは `herdr-app status` に出る。
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

## mod の構造

```
mods/<name>/
  main.js        必須。View を継承したクラスを default export する
  mod.json       任意。初めて見つかったときの置き場所など
  *.js           追加モジュール（"./ui.js" で import）
  *.svg          アイコン類（"mods/<name>/icon.svg" で参照）
  jsconfig.json  check / 起動時に一度だけ生成される。以後は自分のもの
  gpui-kit.d.ts  check / 起動時に生成・上書きされる型定義（コミットしない）
```

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
- モジュールのトップレベルで `globalThis` に副作用を残さない（壊れた保存でもトップレベルは実行済みになる）。

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
- **スペース**: 確かめのタブは machine `wsl` の確かめ専用のスペースに開く。`space.new {"name", "folder", "machine": "wsl"}` で作ると、端末のタブが 1 つ付いてくる。スペースとタブは herdr-core を通して共有されるので、作業者の窓のスペースの一覧にも並ぶ。作業者がそのスペースを表示していない間は、作業者の app はそのタブの file-viewer のコピーを動かさなかった（作業者の app の `shared.json` の `file-viewer:tabs` にそのタブの記録ができず、`file-viewer-cache/` も空のまま、`status` の `errors` も空）。作業者がそのスペースを表示したときにどうなるかは確かめていない。終わったら `space.close {"id", "confirmed": true}` で閉じる。
- **playground の中でだけしてよいこと**: layout の反映（`scripts/deploy.sh layout` を同じ環境変数で）と `layout.switch`、テーマの切り替え（`do app.theme`）。`main-viewer` に切り替えて「Files」を押すと、file-tree のツリーが出た。`app.theme` は playground の窓にだけ効き、作業者の app home の `settings.json` と `layouts/` は変わらなかった。外観がダークの間は、明るいテーマ（`paper`）を選んでも表示は変わらず、ダークのテーマ（`moss`・`ink`・`graphite`）では変わった。
- **描画が打ち切られたかの見方**: 「This view could not be re-rendered」と「interrupted」の帯が出ても、`status` の `errors` は空のままだった。続けて撮った画面に帯が写るかで見る。
- **メモリ**: mod を入れ直すたびに playground のメモリが減って戻らない（下の「制約」の「メモリ」）。入れ直す前に確かめのタブを閉じ、入れ直す回数を減らす。`status` に `out of memory` が出る、表示に `Null"null"` が出る、playground が落ちる・描かなくなったときは、製品の不具合と取り違えず、作業者に再起動の許可を求める。

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
| `image(path)` | app home からの相対パスだけ表示できる。絶対パスと、app home の中の名前が「.」で始まるフォルダ（例: `mods/<name>/.cache/`）の下の画像は表示されない（実機で確認）。他 machine の画像は、`exec` で base64 にして運び、app home に書き出してから表示する |
| `TextView.markdown` | `gpui-base` から import する（`gpui-kit` には無い）。見出し・表・コードブロック・リンクは表示される。ローカルの画像（相対パス・絶対パス）は表示されない。http(s) の画像も、Markdown の `![](https://...)`・段落の中の `<img>`・HTML のかたまりの中の `<img>` のどれも描かれない（同じ URL は WSL と Windows の両方から取れる。開いて 10 秒待っても出ない）。Markdown の中の HTML は、段落の中の `<a href>` はタグが落ちて中の文字だけがただの文字で出て、押しても `on_link_click` に届かない。HTML のかたまり（空行のあとの `<div>` など）の中の `<a href>` はリンクの見た目で出て、押すと `on_link_click` に href が届く。`<img>` は、段落の中では何も出ず（前後の文字の間が空くだけ）、HTML のかたまりの中では行ごと消える。`<picture>` の中に置いた `<a href>` はリンクの見た目にならず、中の文字だけがただの文字で出る。段落と HTML のかたまりの分け方は CommonMark と同じに見える。空行のあとの `<a href="...">名前</a>` だけの行は、1 つのタグだけの行でないので段落になり、押せない。`<a href="...">` だけの行で始めれば HTML のかたまりになり、次の行の文字と `</a>` まで押せるリンクになる。`data:` の画像も描かれない（どれも実機で確認） |
| 線や図形を描く | `PathBuilder.stroke(幅)` / `PathBuilder.fill()` に `move_to` / `line_to` / `add_polygon` / `dash_array` で組んだ path を、`window.paint_path(path, 色).absolute().top(0).left(0).size_full()` として重ねる。座標は、その要素の左上を原点とする論理 px（`"50%"` のような割合も使える）。mod の中の `window` は GPUI の窓で、`herdr` の `window()` とは別物（実機で確認） |
| 位置指定の文字 | 同じ親の中で `absolute()` にした文字だけの要素が、条件によって描かれないことがあった（Mermaid のシーケンス図で、上段の参加者の箱に重ねた名前だけが出なかった）。名前を箱の要素の子にすると出た。原因は未確認 |
| `image(path)` の形式 | PNG / JPEG / GIF / BMP / ICO / WebP（静止画とアニメーション）/ SVG を表示できる（app home の下にコピーして、実機で確認） |
| `image(path)` の読み込み | 画像は、要素が初めて配置されたあと描画の外で読み込まれ、読み込む間は何も描かれない（図の場所が空いて見える）。大きさを指定しない `image(path)` を id 付きの `div` で包んで `on_size_change` を付けると、読み込む間は高さ 0、読み込み終えると画像の大きさ（SVG なら `width` / `height` に書いた大きさ）が届く（`image(path)` に直接付けた `on_size_change` は呼ばれなかった）。1 px に切り抜いた枠（`overflow_hidden`）の中や、窓の外に置いた要素でも読み込まれて届く。読み込んだ画像はパスごとに覚えられ、同じパスのファイルを書き換えても前の絵が出続ける（名前を変えれば新しい絵が出る）。SVG の読み込みにかかる時間の例: 箱と文字 400 組の 500 × 2700 px の SVG 14 個で約 0.6 秒（どれも実機で確認）。file-viewer は、書いた図の SVG を見えない所に置いて読み込ませ、読み込み終えてから整形表示を出す |
| 画面の拡大率 | mod から画面の拡大率（DPI）を取る API は、`gpui-kit.d.ts` と `herdr.d.ts` に見当たらない（`window.viewport_size()` は描ける大きさだけ）。この機械の確かめ専用の窓は拡大率 1 だった。file-viewer は、図の SVG を出す大きさ（論理 px）と同じ大きさで書き出し、その大きさのまま出す（縮めて書き出した絵を引き伸ばさない） |
| `image(path)` の SVG の大きさ | 確かめ専用の窓の image viewer で、線と文字を 100 px おきに並べた SVG を「等倍」で出して撮った。1 枚の SVG は、長い辺が 8,192 px まで（400 × 4,096・400 × 8,192・8,192 × 400・4,096 × 4,096）はくっきり描かれた。400 × 9,000 は少し、400 × 10,000 はもう少しぼやけ、400 × 12,000・400 × 16,384・16,384 × 400 は縮めた画像を引き伸ばしたようにはっきりぼやけた（どれも空白にはならず、`status` の `errors` も空）。app は SVG を画像にするとき、大きさに上限を設けて縮めていると推測する。file-viewer は、図の絵の辺が 4,096 px を超えると 4,096 px 以下のタイル（同じ絵の `viewBox` の切れ端）に分けて書き出し、隙間なく並べて出す。拡大の窓と `.mmd` の倍率は、書き出す絵の面積が 4,096 × 4,096 px に収まるところまでにする（大きな画像でメモリを使い切らないように。どこまで大きくしてよいかは測っていない） |
| `image(path)` の SVG の文字 | SVG の中の `<text>` は、Windows に入っている字体（Segoe UI・Yu Gothic UI・Meiryo など）で描かれる。Herdr が同梱する字体（mod の UI の字体の Geist、端末の JetBrains Mono）は使えず、`font-family` に指定しても、指定しなくても、明朝のような字体になる（`font-weight` の 400 と 600 も同じ）。`font-family="Segoe UI, Yu Gothic UI, sans-serif"` のように日本語の無い字体を先に並べて日本語を混ぜると、英数字まで等幅のように見える別の字体で描かれた（並べた 2 つ目の字体には移らない）。`"Yu Gothic UI"` だけにすると、英数字も日本語も Yu Gothic UI で描かれた。SVG の文字は、部品で描く文字より細く見える（部品の文字は色つきの縁取りで描かれ、SVG の文字は灰色の縁取り）。Yu Gothic UI の 13 px の文字の幅（同じ文字を 10 個並べた幅の 1/10）は、英数字が 2.7〜12.5 px（`i` 3.0、`n` 7.2、`m` 11.0、`M` 11.5、`W` 12.1〜12.5、数字 6.7〜7.5、`@` 12.2）、漢字 12.8、ひらがな 10.4、カタカナ 9.9、半角カタカナ 6.5、空白 約 3.1 px（太さ 600 は少し広く、最大で 0.9 px 増える）。file-viewer の図の文字の幅の見積もり（`lib/mermaid/layout.js` の `textWidth`）の元の作り（半角 0.55 em、全角 1.1 em）は、英字の見本「Round Start Hex Flag 0123 Yes?」で 214.5 px（Yu Gothic UI で 179 px）、日本語の見本「角丸 四角 判定 データベース」で 193 px（同 144 px）と広めだが、`m`・`w`・`M`・`W`・`O`・`@` などの広い文字だけの名前では狭すぎて、箱からはみ出しうる（どれも実機で確認） |
| `fs/promises` | `${appHome()}/...` の形（`/` 区切り）で app home の下の `mkdir` / `writeFile` / `readFile` / `readdir` / `exists` / `unlink` が使える。無いフォルダの `readdir` は例外になる（実機で確認） |
| `fs/promises` の `writeFile` | 文字列は書ける（UTF-8 で書く。先頭が U+FEFF の文字列を書くと、ファイルの先頭が `EF BB BF` になる）。`Uint8Array` / `Buffer` を渡すと 0 バイトのファイルになる（実機で確認）。バイナリは base64 の文字列で書き、PowerShell など外部のコマンドでデコードする |
| `Buffer` / `crypto` | `Buffer.toString("base64")` は空文字列を返す。`createHash().update()` は文字列なら正しく、`Buffer` を渡すと空入力の値になる（実機で確認）。base64 への変換は `btoa`（Latin-1 の文字列のみ）を使う。`TextEncoder` は無い |
| 他 machine への書き込み | `exec` の引数で内容を渡す。上の Windows のコマンドラインの長さの上限が先に効くので、1 回に渡すのは引数としての長さで 24,000 文字程度に抑え（Linux の 1 引数の上限 128 KiB にも収まる）、一時ファイルへ追記して、最後に `mv` で置き換える。置き換える直前にディスク上のハッシュ（`sha256sum`）を比べれば、途中で外から書き換えられていたときに止められる。WSL へ約 416 KB を約 0.6 秒（実機で確認） |
| 閉じるときの呼び出し | `View.close(cx)` は、ペイン・タブ・overlay が消えるときとアプリ終了時に 1 回だけ呼ばれる最後の呼び出しで、閉じるのを止める手段は無い（型定義と AGENTS.md）。後始末は最大 250 ms。表示していないコピーや非アクティブなタブには呼ばれないとも書かれており、終了時に裏のタブで呼ばれるかは読み切れない。表示中のタブを `tab.close` で閉じたときに呼ばれ、その中の `fs/promises` の書き込みが終わることは実機で確認した |
| `check` | `init` の中で始めた非同期処理（`cx.spawn`）は実行されない。非同期の動きは実機で確かめる。初回描画に時間がかかると `interrupted` で失敗する（数十万文字を 1 文字ずつ数える処理を `render` で何度も呼ぶと起きた） |
| 描画の時間 | `render` の中の処理が長いと、その描画は `interrupted` で失敗し、窓には「This view could not be re-rendered; showing the last version that worked」と前に描けた中身が出続ける。同じ内容を描き直すたびに同じ処理をするなら、ずっと進まない。file-viewer の Markdown の画像の書き換えが下の `matchAll` を使っていたときは、約 9,300 文字の文書は通り、約 13,900 文字で止まった（止まったのは実機で確認。quickjs-emscripten で測ると書き換えは 74 ms と 106 ms）。`exec` に変えたあとは、同じ 13,900 文字の書き換えが quickjs-emscripten で約 16 ms |
| 描画の中の整形の準備の大きさ | 区切りながら準備する作りより前の版の file-viewer の整形の準備（当時は `markdownBody` が描画の中で、参照形式の定義の収集、` ```mermaid ` の境目での分割、画像の書き換え、図の解析と配置をする）を初回描画でする mod を `check` に通し、大きさを変えて、interrupted にならない最大を探した（境目の前後は 3〜4 回ずつ）。画像やバッジの多い文書（1 節が、見出し、インラインコードとリンクと `![]()` を含む段落、`<p align="center"><a href><img></a></p>` の HTML のかたまり、参照形式のバッジのリンクと `<a href><img></a>` の段落、3 行の `sh` のコードブロック。末尾に参照形式の定義が 2 つ）は、180 節（46,559 文字、59,519 バイト）がいつも通り、185 節・190 節（47,869 文字・49,179 文字）は通ったり interrupted になったりし、195 節（約 50,500 文字）からはいつも interrupted だった。図だけを並べた文書（1 つの図は `flowchart TD` のノード 6 個・辺 6 本、うち 2 本にラベル）は、6 個がいつも通り、7 個は 3 回のうち 1 回だけ通り、8 個からはいつも interrupted だった。同じ文書の準備は quickjs-emscripten で、180 節が約 47 ms、図 6 個が約 42 ms（図の要素を組み立てる時間は含まない）。`check` は、interrupted になる文書でもそうでない文書でも約 0.75 秒で終わった。実機の窓で file-viewer に開くと、同じ作りの 180 節の文書は整形表示が出て、200 節（51,799 文字、66,199 バイト）は interrupted で「読み込み中…」のままだった（`check` と同じところで分かれる）。ここまでは、その前の版（`markdownBody` が描画の中で一度に準備する作り）で測った値。区切りながら準備する作り（`lib/prepare.js` を描画の中で最後まで進める）で同じように測り直すと、画像やバッジの多い文書は 165 節（42,629 文字、54,509 バイト）がいつも通り（5 回）、170 節・175 節は通ったり interrupted になったりし、180 節からはいつも interrupted だった。図だけを並べた文書は 7 個がいつも通り（6 回）、8 個からはいつも interrupted だった。ここまでは `check` で測った値。図を SVG 画像で描く作り（描画の中では準備までで、SVG の書き出しは描画の外）で、確かめ専用の窓で開いて測り直した（描画の外で準備する大きさを大きくした版を入れ、開いてから続けて撮った画面に「This view could not be re-rendered」「interrupted」の帯が写るかで見た。`herdr-app status` の `errors` は、描画が打ち切られても空のままだった）。画像やバッジの多い文書（上と同じ節）は、100 節（25,599 文字）が 4 回、110 節（28,219 文字、36,139 バイト）が 3 回とも通り、115 節は 3 回のうち 1 回、120 節は 4 回のうち 3 回、140 節は 1 回のうち 1 回 interrupted になった。図だけを並べた文書（上と同じ図）は、3〜5 個がどれも 3 回とも通り、6 個は 4 回のうち 3 回、8〜12 個はどれも interrupted になった（`check` より小さい。窓の描画の時間の余裕が `check` より少ないと推測）。file-viewer の描画の外で準備する大きさは、いつも通った最大の半分を切り下げた 14,109 文字・図 2 個にする |
| 整形表示の部品の重さ | 図の無い Markdown（1 節が、見出し、インラインコードとリンク 2 つの段落、3 行の表、3 行の `js` のコードブロック、リンクを含む 2 項目のリスト）を、整形の準備をせずに 1 つの `TextView.markdown` にして、ボタンで表示してからホイールでスクロールした。押してから画面が変わり終わるまでと、ホイールを送ってから画面が変わるまでを、画面の一部を約 11 ms おきに撮り続けて測った。開く時間は、128 KiB（130,794 バイト）で約 0.33 秒、192 KiB（128,727 文字、196,351 バイト）で 0.69〜0.77 秒、224 KiB（150,311 文字、229,153 バイト）で 0.89〜0.90 秒、256 KiB（171,966 文字、262,026 バイト）で 0.84〜1.06 秒（3 回のうち 2 回が 1 秒以上）、288 KiB・320 KiB で 1.2〜1.3 秒だった。この部品を表示している間は、窓を描き直すたびに同じだけ時間がかかるらしく、ホイールへの反応は 128 KiB で約 0.15 秒、192〜256 KiB で 0.3〜0.85 秒だった（ほかのタブの動く印などで窓が描き直され続けているときに測った）。図だけを並べた Markdown（図は上の行と同じ）で配置を済ませた図を描くと、100 個までは開くのが約 0.1 秒・ホイールへの反応が約 0.04 秒で止まらなかったが、描画の中で図の要素を組み立てる時間で、106〜109 個は描けたり interrupted になったりし、112 個からはいつも interrupted で描けなかった。ここまでの図の数は、図を箱・線・文字の部品で組み立てて描いていた版（SVG 画像で描く前の版）で測った値。図を SVG 画像で描く作りで、確かめ専用の窓で測り直した（図は上と同じ。整形表示の上限の図の数だけを大きくした版を入れ、開いて整形表示になってから 3 回ホイールを送り、送ってから画面が変わるまでを約 45 ms おきに撮って測った。開く間は、0.45 秒おきにツールバーのボタンにマウスを載せ外しして、見た目が変わるまでを測った）。100・200・400 個は、スクロールへの反応が 0.12〜0.18 秒。500 個（82,577 文字、117,589 バイト）は、開いた直後の 3 回と、整形表示の上限のすぐ下の画像の多い文書を開いて閉じたあとの 2 回のどれも整形表示になり、スクロールへの反応は 0.12〜0.20 秒、開く間のマウスへの反応は最も長くて 0.26 秒（3 回）だった。開いてから整形表示になるまでは、操作を送る道具の時間を含めて約 9〜11 秒（整形の準備の 10 秒の上限に近い）。600 個と 800 個は止まりはしないが、整形の準備（図の配置と SVG の書き出し）が 10 秒を超えて、代わりの整形表示になった。file-viewer の整形表示の上限は、1 秒以上止まらず整形表示になった最大の測定点の、229,153 バイトと図 500 個にする。この値にした版で図 500 個の文書を開くと、整形表示になり、スクロールへの反応は 0.11〜0.17 秒で、先頭・図 118 のあたり・末尾（図 500）のどの図もノードの名前（ひし形の「入力はある？」、丸の「終了 N」を含む）が全部出た。図 501 個の文書はソース表示で開き、上限の帯が出た。同じ文書の上で比べると、整形表示の上限（150,311 文字、図 500 個）は描画の外で準備する大きさ（14,109 文字、図 2 個）より大きいので、描画の外の準備が使われる |
| file-viewer の大きな Markdown（実機） | 区切りながら準備する作りの file-viewer で、開いたあと 250 ms おきにホイールを送り、画面が変わるまでの時間を測った。図の無い節と画像の多い節を交互に並べた 219,540 バイトの文書は、開くときに最も長くて 0.45 秒、スクロールで 0.21〜0.33 秒。見出し・表・コードブロック・リンクの 228,691 バイトの文書（整形表示の上限のすぐ下）は、開くときに最も長くて 0.6 秒、スクロールで 0.37〜0.74 秒（1 秒は超えないが、余裕は少ない）。見出しと段落と図を 100 組並べた文書は、「整形中…」のあと整形表示になり、スクロールで約 0.05 秒。画像の多い 46,559 文字の文書は「整形中…」のあと整形表示になり、開いたまま 2 秒おきに追記すると、「整形中…」に戻らずに差し替わり、スクロールの位置（末尾）も保たれた。図 100 個の文書は、mod の実行環境のメモリを使い切りかけていたときに「Null"null"」で描けなくなったことがある（下の「メモリ」）。再起動のあとは描けた。スクロールの位置をコピーが持つ形（下の「表示していない間の部品の状態」）にしたとき、整形表示の上限のすぐ下の、見出し・表・コードブロック・リンクの 228,690 バイトの文書で、ホイールを送ってから画面が変わるまでを、同じ playground に入れ直しながら順に測ると、この形で 0.90〜1.03 秒（9 回）、app の部品でスクロールさせる前の版で 0.94〜1.17 秒（6 回）、もう一度この形で 1.17〜1.31 秒（6 回）だった（入れ直す前の、前の版の最初の測定は 0.87〜0.91 秒。入れ直しを重ねるほど遅くなり、playground のメモリが減っていくためと推測する。この作りの前の測定の 0.37〜0.74 秒より遅く、どちらの形でも 1 秒を超えた。2 つの形の差は、この測り方では見分けられなかった）。13,930 文字の文書と図 100 個の文書では、どちらの形でも 0.10〜0.13 秒。上限のすぐ下で 1 秒未満に収まるかは、この playground では確かめられず、再起動したあとに 2 つの形を測り直す |
| 中身の差し替えとスクロール | 整形表示を少し下までスクロールしてから、部品の要素の id を変えずに中身を差し替えると（1 つの `TextView.markdown` でも、文章と図を並べた file-viewer の整形表示でも）、スクロールの位置は保たれた |
| 表示していない間の部品の状態 | `overflow_y_scrollbar()` でスクロールさせた file-viewer の整形表示を下までスクロールし、別のタブを選んでから戻ると、先頭に戻った（図の無い 13,930 文字の文書と、図 100 個の文書）。同梱の `files` のツリー（同じ `overflow_y_scrollbar()`）も、パネルを閉じて開くと先頭に戻った。戻った直後には、整形表示の本文（`TextView.markdown`）が空の 1 フレームが写ることがあった。View のインスタンスは残る（読み込み直しも「読み込み中…」も無い）。表示していない間は `render` も呼ばれなかった。ここから、表示していない間に app がそのタブの部品の状態（スクロールの位置、`TextView` の中身）を捨てていると推測する。型定義には、`overflow_*_scroll` の場所のスクロールの位置を読み書きする API が無い（`VirtualListScrollHandle` の `scroll_to_item` / `scroll_to_bottom` は仮想リスト用で、リストの行の中には `on_click` などを付けられない）。file-viewer の整形表示は、スクロールの位置をコピーが持ち、`overflow_hidden()` の枠の中で本文を `absolute().top(-位置)` で出し、`on_scroll_wheel` で動かす（同梱の `picker` と同じ形）。つまみは `Slider` を縦にして、ドラッグと溝を押すことで動かす（下の「スクロールバー」）。この形で、戻ったときにもとの位置で出ることと、ソース表示から戻ったときも前の位置で出ることを確かめた（どれも実機で確認）。この形でも、戻った直後に本文が空の 1 フレーム（約 0.1 秒）が写ることがある。上に書いたとおり、位置をコピーが持つ形にする前の `overflow_y_scrollbar()` の作りでも写っていた（実機で確認）。表示していない間に app が部品の描いた中身を捨て、戻ってから描き直すまでの間だと推測する。ソース表示から入るときと違い、タブに戻るときには先に出していた表示が無いので、mod はこのフレームを重ねて隠せない |
| スクロールバー | app のスクロールバー（`overflow_y_scrollbar()` の Files のツリー・サイドバーのスペースの一覧、Editor）を、確かめ専用の窓で撮って測った。つまみは幅 6 px で、場所の右端から 4 px 内側、上下の端からも 2〜4 px 内側にある。色は、背景に関わらず文字の色（`theme()` の `foreground`）を約 35% 重ねた色と一致した（graphite で `#17191d` の上に `#626366`、`#101114` の上に `#5d5e60`、paper で `#ffffff` の上に `#afafb0`）。つまみにマウスを載せると、右端を保ったまま幅 8 px に広がり、文字の色を約 55% 重ねた色になる（graphite と paper の両方で、file-viewer のつまみと同じ色に写った）。つまみの長さは場所と中身の高さの比で決まり（Files のツリーで 688 px の場所に 176 px）、866 行の文書の Editor では 40 px だった（比で決めると約 24 px なので、下限が 40 px ほどあると推測する）。出し入れ（`mode` を付けない、テーマに従う既定）は、スクロールすると出て、最後のスクロールから約 2 秒で消えた（約 45 ms おきに撮って、薄れていく途中のフレームは写らなかった）。消えている間にスクロールバーの場所やつまみの場所にマウスを載せても出ない。出ている間につまみにマウスを載せると、2 秒たっても出たまま。`theme()` にスクロールバー専用の色の名前は無い。file-viewer の整形表示のつまみ（`Slider`）は、この幅・位置・色・長さ（下限 40 px）・出し入れに合わせ、並べて撮って同じ色と幅に写ることを確かめた（どれも実機で確認） |
| 選びながらのスクロール | file-viewer の整形表示（`overflow_hidden()` の枠の中で本文をずらして出す形）で、本文の中で左ボタンを押してから上下の端に動かした。`on_mouse_move` は押しているボタンを知らせないが、枠の `on_mouse_down("left")` は `selectable(true)` の `TextView.markdown` の上で押しても届いた。枠で押している間を覚え、端から 32 px の帯に来たら、`cx.spawn` の中で入出力の `await` を挟みながら位置を進め続けると、本文は下へも上へもスクロールし続けた。選んでいる範囲（`TextView` の選択）は、部品がマウスの動きを受けたときに、そのときマウスの下にある文字まで伸びた。マウスを止めたままにすると、本文はスクロールしても範囲は伸びず、最後に動かしたときの文字で止まったまま本文と一緒に流れた。止めたまま離しても伸びなかった（`PostMessage` で押す・動かす・離すを送って撮った。どれも実機で確認）。mod から部品にマウスの動きを送る手段や、選択の範囲を書き換える API は型定義に見当たらないので、止めたままの間を伸ばすことはできない。`on_mouse_move` と `on_mouse_up` は要素の上にある間しか届かないので、本文の外に出たら止める（外に出てもスクロールし続ける app の作りとは違う） |
| 整形表示の部品の作り直し | 新しく描画の木に置いた `TextView.markdown` は、中身を描くまでの数フレーム、高さ 0 の空のまま描かれる（13,930 文字の文書で、ソース表示から整形表示に切り替えると、本文の空いた画面が約 0.2 秒・3 フレーム写った）。部品を包む `div` に `on_size_change` を付けると、空の間は高さ 0、中身を描くと中身の高さが届く。file-viewer は、ソース表示・「整形中…」・「読み込み中…」から整形表示に入るとき、文章の部分のどれもが高さを持つまで、入る前の表示を本文の上に重ねて出す。この形で、ソース表示から整形表示と「整形中…」から整形表示（46,559 文字の画像の多い文書）の間に、空のフレームは写らなかった（約 45 ms おきに撮った。どれも実機で確認） |
| 整形の準備を区切る時間 | file-viewer の区切りながらの準備（`lib/prepare.js`。かたまり 1 つ分の定義の収集、かたまり 1 つ分の画像の書き換え、図 1 個の解析と配置を単位にする）を quickjs-emscripten で測った。図の無い節と画像の多い節を交互に並べた整形表示の上限の大きさの文書（162,634 文字、229,104 バイト）は、一度に進めると 154 ms、1 単位は最も長くて 7 ms、100 ms の予算で区切ると 2 区間で、1 区間は最も長くて 100 ms。同じ文書に図を 100 個混ぜたもの（229,055 バイト）は、一度に進めると 844 ms（ほとんどが図の配置）、1 単位は最も長くて 10 ms、100 ms の予算で 9 区間、1 区間は最も長くて 105 ms。大きさの判定（`lib/render-size.js` の `judgeSize`。UTF-8 のバイト数は `unescape(encodeURIComponent(text)).length` で数える。1 文字ずつ数えると 1 MiB で約 45 ms、この形なら約 10 ms）は、整形表示の上限の大きさで約 7 ms、1 MiB の文書で 10〜14 ms（app の QuickJS でも、`check` の中で測って同じくらい） |
| `matchAll` | 呼ぶたびに正規表現を作り直す（仕様どおりの複製）。quickjs-emscripten で、リンクを拾う大きな正規表現なら 1 回 約 0.1 ms かかり、短い文字列に何百回も当てると、照合よりこちらが重い。`exec` を繰り返せば作り直さない。描画の中で何度も呼ぶ処理では `exec` で集める（`lib/markdown.js` の `matchesOf`） |
| メモリ | mod の JavaScript は QuickJS-ng で動く（app の中の文字列から）。`check` の中で 1 MiB の文字列を作り続けると、約 252 MiB で `out of memory` になった（mod の実行環境ごとの上限は 256 MiB ほどと推測）。動いている app で file-viewer の実行環境がメモリを使い切ると、表示中のタブに「This view could not be re-rendered」と `Null"null"`、新しいタブに「file-viewer did not load: Null"null"」が出て、保存で読み直しても `herdr-app status` に `reloading ...: out of memory` が出て読み込めなかった（前の版のファイルに戻しても同じ。`check` は通る）。再起動で戻った。同じ mod のタブ（コピー）は、それぞれがモジュールを読み込み直す（モジュールのトップレベルの値がコピーごとに別）。file-viewer に、確保できる量（1 MiB の文字列を作り続けて数える）を記録させて測ると、コピーを 1 つ作るたびに約 1 MiB 減り、mod のファイルを保存して読み直すたびに、開いているコピーの数だけ（タブ 7 つで約 7 MiB）減って戻らなかった（前の版の file-viewer で測定。何もしない 30 秒の間は減らなかった）。読み直しを何十回も繰り返すと、使い切りうる。文字列を作るだけでは循環参照の回収が走らない可能性があり、回収されないごみか本当に解放されないものかは見分けていない |
| `cx.spawn` の始まり | `cx.spawn(async (cx) => ...)` に渡した関数は、最初の `await` までは呼んだその場で続けて動く。`render` の中で spawn すると、そこまでは描画の中で、そこで `cx.notify()` を呼ぶと「cx.notify() is not allowed during the `render` phase」の例外になる（実機で確認）。描き直しを求める非同期処理は、先に入出力を `await` してから `cx.notify()` する |
| 図の配置の再帰の深さ | mod の実行環境のスタックは浅い。初回描画で、縦に 1 本につながった flowchart（`N0-->N1-->…`）を配置する使い捨ての mod を `herdr-app check` に通すと、30 ノードは通り、40・50・60・90・121 ノードは「thread 'main' has overflowed its stack」で `check` の処理ごと落ちた（終了コード 253。同梱の dagre のグラフをたどる再帰が深くなる。1 つのノードから分かれて戻る図は 400 ノードでも落ちず、時間切れの interrupted になった）。確かめ専用の窓で、121 ノードがつながった図 1 個の文書を開くと、窓のプロセスごと落ちた。main の版の file-viewer（同じ dagre）でも `check` で同じに落ちた。再帰を自前のスタックで回す形に直した dagre では、40・121・400 ノードとも落ちず、interrupted になった。スタックの上限は JS の例外（RangeError）にならずにプロセスが落ちることがあるので、深さが入力の大きさで増える再帰を mod に置かない。`herdr-app check` は別のプロセスで動くので、落ちるかもしれない処理は、窓で開く前に `check` で確かめられる |
| 長い同期処理 | `cx.spawn` の中で、`await` を挟まずに続けて動く区間が約 0.5 秒を超えると、その非同期処理は黙って止まる（続きが動かず、例外も `status` の `errors` も出ない。500 ms の空回しは通り、550 ms で止まった）。`await` を挟めば、全体で 0.5 秒を超えても続く。ただしマイクロタスク（`await Promise.resolve()`）では区切れず止まる。`fs/promises` の `exists` / `readdir` などの入出力を `await` すると区切れる（実機で確認）。重い処理は 1 区間を数百 ms に収め、間に入出力の `await` を挟む。file-viewer の描画の外の整形の準備では、図 1 個の解析と配置が区切れない 1 単位になる。再帰を自前のスタックで回す形に直す前の dagre（上の「図の配置の再帰の深さ」）のまま、quickjs-emscripten（0.31.0）で `layoutMermaid` を測ると、1 本の連鎖の `flowchart TD`（`N0-->N1-->…`）は 46〜48 ノードで約 50 ms、206 ノードで約 0.29 秒で、208 ノードからはスタックが溢れて（配置の中の再帰が深くなる）、約 0.15 秒でその図の失敗（「1 行目の文法エラー」）になった。スタックの上限を外すと、300 ノードで約 0.49 秒、310 ノードで約 0.51 秒。1 つのノードから分かれて 1 つのノードに戻る図（`R-->Ni-->Z`）はスタックが溢れず、間のノード 30 個で約 41 ms、250 個で約 0.46 秒、270 個で約 0.52 秒。確かめ専用の窓で `.mmd` を開くと、この形の図は 200 ノードは出たが、270 ノードと 400 ノードは図 1 個の配置の 1 単位のまま非同期処理が止まり、10 秒後に描けない図の「図の準備が終わらなかった」になった（スタックが溢れたのか、0.5 秒を超えて止まったのかは見分けていない）。200 ノードの図は、確かめ専用の窓で配置の 1 区間が 454〜482 ms かかり、16 回開いて 3 回、その区間から戻らずに止まった（区間に入ったまま、続きも `finally` も動かなかった）。file-viewer の見張りは、区間の外でしか動かないので、区間が残っていれば止まったと見なし、10 秒を待たずに準備を始めからやり直す（止まってから気づくまでの間も 10 秒に数える）。この形にしてから 200 ノードの図を 12 回開くと、すべて図が出た（11 回は約 1.6 秒、止まってやり直した 1 回は約 3.5 秒）。270 ノードの図は、やり直しを続けて約 11 秒で「図の準備が終わらなかった」になった |
| UTF-8 の判定の時間 | file-viewer の、base64 で運んだバイト列の判定（`lib/utf8.js`）は、QuickJS 上で base64 の 20 万文字に約 75 ms。1 MiB 近いファイル（base64 で約 139 万文字）を続けて確かめると 0.5 秒を超えて止まるので、25 万文字ずつ入出力の `await` を挟んで確かめる。WSL から `base64 -w0` で約 1 MB のファイルを運ぶのは約 70 ms（実機で確認） |
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
