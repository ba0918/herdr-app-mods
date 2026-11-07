# 大きな Markdown の整形表示の実装計画

File viewer 仕様の「整形の準備」と「整形表示の上限」（2026-11-07 の改訂）と、図を SVG 画像として描く改訂（2026-11-08、コミット d41fc0d）を、今の `mods/file-viewer/` に入れる計画。実装ブランチは `large-markdown`。Step 1〜6 は実装済みで（下の「実装済みのステップ」）、Step 7 から続ける。

## Goal

画像やバッジ・図の多い大きな Markdown を開いても整形表示が止まらず（描画の外で整形の準備をして「整形中…」を出す）、部品が描くのに重すぎる Markdown はソース表示で理由を出して開き、Mermaid の図は SVG 画像として描いて図の多い文書（64 個を超える）でも止まらず、拡大してもくっきりした状態にする。

## Specification

- [viewer](../spec/file-viewer/viewers.md) — [整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)（今の内容を表示する、プレビュータブで整形表示に戻す）、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)（画像を押せる名前にする処理そのもの）、[上限](../spec/file-viewer/viewers.md#上限)、[任せたこと](../spec/file-viewer/viewers.md#任せたこと)
- [編集・保存と外部変更](../spec/file-viewer/editing.md) — [外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)、[下書き](../spec/file-viewer/editing.md#下書き)
- [開き方とタブ](../spec/file-viewer/opening-and-tabs.md) — [プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)
- [Mermaid 図](../spec/file-viewer/mermaid.md) — [描き方](../spec/file-viewer/mermaid.md#描き方)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)（図ごとの失敗の出し方と行番号、.mmd の時間切れと書き出しの失敗）、[拡大表示](../spec/file-viewer/mermaid.md#拡大表示)、[色](../spec/file-viewer/mermaid.md#色)、[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)
- [File viewer 仕様（入口）](../spec/file-viewer/index.md) — [共通の前提](../spec/file-viewer/index.md#共通の前提)、[実機の確かめ](../spec/file-viewer/index.md#実機の確かめ)、[作らないもの](../spec/file-viewer/index.md#作らないもの)、[任せたこと](../spec/file-viewer/index.md#任せたこと)
- [image viewer](../spec/file-viewer/viewers.md#image-viewer)（画像のコピーの置き場所と消し方。SVG のキャッシュが同じ決まりに乗る）
- 用語: [CONTEXT.md](../../CONTEXT.md)（整形の準備、プレビュータブ、外部変更）
- プラットフォームの事実と制約: [mod 開発ガイド](../guides/herdr-app-mod-development.md)（「開発ループ」「制約」。特に「描画の時間」「`matchAll`」「長い同期処理」「`check`」「`herdr-app shot`」「`cx.spawn` の始まり」「メモリ」）

## Approach and why

### 今の作り（読んで分かったこと。Step 6 まで入れたあと）

- 整形の準備は `lib/prepare.js`（区切りながら進める準備。結果は文章の部分と図ごとの配置か失敗の並び `parts`）と `lib/markdown-state.js`（見え方の決まり `MarkdownState`。`sync`・`tick`・`watch`・`display` など）にある。`main.js` の `syncMarkdown`・`runPreparation`・`watchPreparation` が描画とつなぐ。大きさの判定と上限は `lib/render-size.js` の `judgeSize`・`PREPARE_IN_RENDER`・`RENDER_LIMIT`。
- 整形表示は `views/markdown.js` の `markdownBody` が `parts` から描く。図は `views/mermaid.js` の `diagram(layout, scale, t)` が、箱・線・文字の要素を描画のたびに組み立てる。これが図の多い文書の描き直しで重く、実機では図 50 個まではいつも描け、60 個は重い文書のあとに、65 個以上はいつも interrupted になった（受け入れの確かめ）。一部のノードの名前（ひし形・丸など）が、倍率が 1 でないときやスクロールのあとに出ない不具合もある（原因は未確認）。
- 図の拡大の窓は、overlay として開く file-viewer の別のコピーで、`main.js` の `renderOverlay` が `lib/overlay-layout.js` の `OverlayLayout` で描画の外で配置し、`zoomArea`（`views/zoom.js`）の中に `diagram` を描く。overlay のコピーは別のモジュールの読み込みで、タブのコピーとメモリは共有しない（props で受け取る）。
- `.mmd` は `main.js` の `mermaidFile` が描画の中で `layoutOf` を呼び、`zoomArea` に `diagram` を描く。
- 画像のコピーは `io.js` の `copyImage` が app home 直下の `file-viewer-cache/` に `<タブの token>-<内容のハッシュ 12 桁>.<拡張子>` で置き、`main.js` の `sweepCaches` がタブを閉じたものや使われていないものを消す（`CACHE_NAME` の正規表現で名前から token を取る）。画像は `image(パス)` で出している。
- テーマは `main.js` の `themeKey(t)` で、描画のたびに前のテーマと比べている（Editor の作り直しに使っている）。
- ファイルの書き込みは `fs/promises`（非同期）だけで、描画の中では待てない。`gpui-kit` の画像の部品は `image(パス)` だけで、SVG を文字列のまま渡す口は無い（型定義で確認）。

### SVG の試し（spike 2）で分かったこと

使い捨ての試しで、図を SVG 画像にして描いた（コードは `.agents/scratch/svg-spike/` に残した。メインのチェックアウトの ignore された場所なので、無くなっていることがある。その場合も下の事実は変わらない）。

- 配置した図（`lib/mermaid/layout.js` の layout）から SVG の文字列を作り（箱・線・矢じり・文字・色）、`fs.writeFile` で `file-viewer-cache/` に書き、`image(パス).w(幅).h(高さ)` で出すと、図 100 個・85 個の文書でも、開いた直後・30 秒後・最後までスクロールしたあと・重い文書を開いて閉じたあとのどれでも interrupted が出なかった。
- SVG の中の文字は、日本語を含め全部出た（ひし形の「判定」なども）。ただし英数字が別の字体（等幅のよう）に見え、太字が細かった。
- 図 100 個の SVG を作るのに約 55 ms、書き出し終わるまで約 0.57 秒（図 1 個は数 ms）。
- 名前を `<タブの token>-<ハッシュ 12 桁>.svg` にすると、今の `sweepCaches` がそのまま効いた。
- 拡大の窓で 2〜3 倍を超えると、同じ SVG を引き伸ばすのでぼやけた（大きさを変えて書き出し直せばくっきりするはず。未確認）。
- 同じ名前のファイルを上書きしたとき app が前の絵を使い続けるかは確かめていない（名前を変えれば避けられる）。

### 作り方の全体

- **コマンドの呼び方と反映**: `herdr-app <サブコマンド>` は、ガイドの「開発ループ」の `$APP`（Windows 側の `herdr-app.exe`。PATH には無い）で呼ぶ。mod は `scripts/deploy.sh file-viewer` で app home に反映し、同じスクリプトが `herdr-app check` を通す。`mods/file-tree/` の `lib` は `mods/file-viewer/lib` へのシンボリックリンクなので、lib を変えたら `scripts/deploy.sh file-tree` も流す。app home 側を直接編集しない。
- **判断は lib、つなぎは main.js と views**。今の分け方を保つ。仕様の「確かめ方」が単体テストを指定している判断（区切りながらの準備、描画の外で準備する大きさの判定、見え方の決まり、10 秒の扱い、整形表示の上限で表示を選ぶ処理）は `mods/file-viewer/lib/` に置き、`herdr` / `gpui-kit` を import しない。lib は QuickJS で動く書き方に限る。描画の中や準備の 1 区間の中で何度も呼ぶ所で `String.prototype.matchAll` を使わない（ガイドの「`matchAll`」。lib/markdown.js の `matchesOf` を使う）。正規表現での `split` も、仕様上は同じく正規表現を複製するので、同じ所では避ける（ガイドには書いていない、この計画の推論）。
- **順番**: 実機の事実を測る（Step 1）→ 区切りながら準備する処理（Step 2）→ 見え方の決まり（Step 3）→ 画面へのつなぎ（Step 4）→ 整形表示の上限（Step 5）→ 通しの確認（Step 6）。Step 1 の (3)〜(5)（部品と図の重さ、差し替えでスクロールが保たれるか）で Step 2〜5 の作りと基準が変わるので最初に置く。(1)・(2)（描画の中で済む大きさ）は今の処理で測る仮の値で、Step 6 で新しい処理で測り直して定数を直す。Step 2・3 は lib だけで互いに独立している（順は 2 → 3 とする）。Step 4 が両方を使う。
- **順番（SVG の改訂）**: 確かめ専用の窓の手順をガイドに書き、置き換える前の図を撮っておき、SVG で使える字体を確かめる（Step 7）→ 配置から SVG を作る lib（Step 8）→ 整形表示の図を SVG で出す（書き出しを整形の準備に入れる。Step 9）→ テーマの切り替え（Step 10）→ 拡大の窓（Step 11）→ .mmd（Step 12）→ 部品で描く図を消し、上限を測り直し、通しの確認（Step 13）。Step 7 の比べる元の画像は、図を SVG に置き換える前（Step 9 より前）でないと撮れないので最初に置く。Step 8 は lib だけで独立。Step 9〜12 は Step 8 を使い、Step 10・11 は Step 9 の書き出しの仕組み（キャッシュの名前と消し方）を使い、Step 12 は Step 10・11 の仕組みも使う。
- **確かめの場所**: Step 7 からの実機の確かめと測定は、すべて[確かめ専用の窓](../spec/file-viewer/index.md#実機の確かめ)で行う（P16）。作業者の app には、受け入れの前まで mod を入れない（入れ直すたびにメモリが減って戻らない。ガイドの「メモリ」）。

### 仕様が決めていないことへの仮の答え

それぞれ、覆す条件（作業者がこう言えば変える）を添える。

- **P1 測るための mod**: Step 1 と Step 6 の測定は、使い捨ての mod（`fv-probe`）で行う。リポジトリに未追跡の `mods/fv-probe/` を作り（コミットしない）、`mod.json` を `{"place": "none", "title": "fv-probe"}` にして `main.js` より先に置く（`place` が無いと、app が今の layout に組み込むため）。file-viewer の部品は、`mods/file-tree/` と同じく `mods/fv-probe/lib` などを `../file-viewer/lib` へのシンボリックリンクにして使い（mod は自分のフォルダの外を import できない）、`scripts/deploy.sh fv-probe` で app home に反映する。見本の文書は、mod の中の JavaScript で作るか、mod のフォルダに置いた JS のモジュール（文字列を export する）から読む（`check` は非同期を動かさないので、ファイルを読む方法は使えない）。結果は `fs/promises` で app home 直下の `fv-probe-result.json` に書き、実装者が WSL から読む。`shared` には書かない（動いているアプリからはキーを消せないため）。終わったら、開いたタブを閉じ、app home の `mods/fv-probe/` と結果のファイル、リポジトリの `mods/fv-probe/` を消す（未追跡のファイルの削除なので、消せないときは一時の場所へ移す）。測る前と後で app home の `layouts/` の中身が同じことを確かめる。覆す条件: なし。
- **P2 interrupted になる大きさは `herdr-app check` で探す**: ガイドの「`check`」のとおり、`check` は初回描画が長いと `interrupted` で失敗する。そこで、見本の文書の整形の準備を初回描画の中でする `fv-probe` を、大きさを変えて `check` に通し、通る最大の大きさを探す（画面を使わずに済む）。実機の窓でも同じ大きさの前後で止まるかを、Step 1 の (6) で 1 回見て、食い違えば窓の結果を採る。覆す条件: なし。
- **P3 画面を使う確かめ（Step 1〜6 で使った。Step 7 からは P16 に置き換える）**: 部品が固まる時間と、差し替えでスクロールが保たれるかは、キーを送って画面を撮らないと分からない。メインのチェックアウト（worktree ではない、リポジトリの元の作業ツリー）の `scripts/desktop/`（未追跡。WSL から PowerShell で画面を撮り、キーとクリックを送る道具。使い方と注意はその README）を使う。止まった時間を測るには、呼ぶたびに PowerShell を起動する今の道具では間隔が粗いので、1 つの PowerShell の中でキーを送ってから時刻付きで続けて撮る小さなスクリプトを `.agents/scratch/` に作り、撮る間隔を 100 ms 以下にする。画面とマウスを使うので、**始める前に止まり、作業者に PC から手を離してもらえるかを確かめる**（作業者が今使っている機械への外からの操作なので）。実機の窓で重い文書を開く確かめ（Step 1 の (6)、Step 4〜6 の重い見本）と、作業者の表示を切り替える `tab.new` も、同じく始める前に確かめる。`tab.new` で開いたあとは、確かめが終わったら作業者がもともと見ていたタブに `tab.select` で戻す。重さを測るときは小さい大きさから上げていき、初めて 1 秒以上止まったところで打ち切る。止まったまま 10 秒戻らないときや app が落ちたときは、そこで止めて作業者に返す。herdr-app は再起動しない。送る前に毎回 `need:herdr-app` を付け、送り先のペインにフォーカスがあることを撮った画像で確かめる（実装者自身が herdr-app の端末で動いているので、フォーカスがそこに残っていると自分の入力欄に入る）。止まった時間は、キーを送ってから画面が変わるまでを、続けて撮った画像の差で測る（仕様の「整形表示の上限」）。止まった時間の測定には `herdr-app shot` を使わない（描き直されない間は前の画面を返すため。止まっていない画面を 1 枚見るだけの確かめには使ってよい）。メインのチェックアウトに `scripts/desktop/` が無いときは、止めて返す（未追跡の道具なので、無くなっていることがある）。覆す条件: 作業者が、画面を使う確かめは受け入れでまとめて自分でやると言ったとき。そのときは、整形表示の上限を仮の値（バイト数 256 KiB、図の数 100）にしてガイドに「仮」と書き、Step 1 の (5) は「未確認」、Step 6 の画面の確かめは受け入れに回す。
- **P4 区切りながらの準備の作り**: 準備を、少しずつ進められる単位の並びにする。単位は、かたまり（`blocksOf` のかたまり）ごとの定義の収集、文章の部分ごとのかたまりの画像の処理、図 1 個の解析と配置（定義の収集も文書全体で 1 単位にしない）。lib に「準備を始める（中身を受け取る）」「時間の予算まで進める（今の時刻を返す関数を受け取る）」「終わったか・結果」を持つものを置く。かたまりをまたいで続く状態（`<picture>` の中か）も持ち越すが、今の作り（図の部分ごとに `rewriteImages` を呼ぶ）と同じく、図の境目で初めに戻す。描画の中で済ませる文書は、同じものを予算無しで最後まで進めて使う（一度に準備した結果と区切った結果が同じだと、テストで比べられる）。予算無しの結果は、今の `collectDefinitions` + `splitMermaidBlocks` + 部分ごとの `rewriteImages` と同じにする（外から見た振る舞いを変えない）。準備の結果は「文章の部分の書き換えた Markdown と、図ごとの配置（か失敗）」の並びで、`markdownBody` はこの結果から描く（描画の中で `layoutOf` を呼ばない）。図の配置は文書ごとに全部覚えておくことになり、`this.diagrams` の 64 個の上限は整形表示では使わない（Step 1〜6 の時点では `.mmd` と図の拡大の窓はこれまでどおり `layoutOf`。Step 11・12 で置き換える）。覆す条件: なし。
- **P5 区切り方**: 描画の外の準備は `cx.spawn` の中で、1 区間を 100 ms ほどの予算で進め、区間の間で入出力を `await` する（ガイドの「長い同期処理」のとおり、マイクロタスクでは区切れない）。区切りの入出力は、app home の `fs/promises` の `exists` など副作用の無いものにする。覆す条件: なし。
- **P6 10 秒の数え方**: 「準備を動かしている間の時間」は、区間ごとに進めた時間と、区間の間の `await` の時間の合計で数え、タブを表示していなくて止めている間（P7）は足さない。数えるのは準備 1 つ（中身 1 つ分）ごとで、やり直したり次の中身に進んだりしたら 0 から数える。覆す条件: なし。
- **P7 表示していないかどうか**: 区間ごとに `identify()` で自分のタブの状態を取り直し、`visible()` と同じ決まり（space が表示中で、タブが選ばれている）で決める（`this.me` は `render()` でしか取り直さないので、そのままでは古いことがある）。表示していなければ次の区間に進まず、表示に戻った描画で続きを始める。覆す条件: なし。
- **P8 上限で移したソース表示の持ち方**: タブの記録の `mode` は利用者が選んだものだけを持ち、上限で移したソース表示はタブの中の状態（記録に書かない）で持つ。上限を下回ったあとも、利用者がボタンを押すか、タブを開き直す・再起動するまでソース表示を続ける（仕様の「整形表示の上限」）。開き直し・再起動では記録の `mode` から始めて、上限を比べ直す。利用者が選んだソース表示のタブでも、上限を超えている間は理由の知らせを出し、整形表示のボタンを出さない（仕様の「上限を超えている間は…ボタンを出さない」と「ソース表示で開いたときは理由を出す」を、表示を選んだのが誰でも同じに読む）。覆す条件: 作業者が、自分で選んだソース表示のときは理由の知らせを出さなくてよいと言ったとき。
- **P9 整形表示の上限のバイト数の数え方**: 今の内容（`file.editor.value()`）を UTF-8 にした大きさを、`TextEncoder` を使わずに数える（QuickJS に無い。ガイドの「制約」）。BOM は数えない（`file.editor.value()` は BOM を外した内容。差は 3 バイト）。図の数は ` ```mermaid ` のブロックの数で、`splitMermaidBlocks` と同じ数になる軽い数え方でよい。中身が変わるたびに、ソース表示で打鍵するたびにも数えるので、バイト数・文字数・図の数を合わせた判定が 1 MiB の文字列で 10 ms 以下になる数え方にする（Step 2 で測る）。覆す条件: なし。
- **P10 差し替えでスクロールを保つ試み**: 前の整形表示から新しい整形表示へ差し替えるとき、部品の要素の id（`fv-markdown-*`）を変えない。Step 1 の測定で保たれないと分かったら、それ以上の手は打たず、先頭に戻ることを受け入れてガイドに書く（仕様の「整形の準備」）。覆す条件: なし。
- **P11 知らせの持ち方**: 整形表示をしない理由、画像を押せる名前にできなかった知らせ、整形の準備が終わらなかった知らせは、`file.notice` と別のタブの状態として持ち、`notices()` で帯にする（答えのボタンは無い）。`file.notice` と別なので、外部変更の知らせの重なりの判断（`lib/notices.js`）には入らず、仕様の「知らせるだけのもの」と同じく並んで出る。覆す条件: なし。
- **P12 代わりの整形表示**: 失敗したときの代わりの整形表示は、今の内容を ` ```mermaid ` の境目で分けずに、そのまま 1 つの文章の部分にする（図はコードブロックとして出る）。この部分の並びは lib の関数が作り、`markdownBody` はそれを描くだけにする（仕様の確かめ方が求める単体テストのため）。覆す条件: なし。
- **P13 準備の状態の置き場所**: 準備の状態（進めている準備、出している結果、上限で移したソース表示の印、失敗の知らせ）は `this.file` ではなく、ビューの入れ物（今の `this.mdBox` のようなもの）に `loadedKey` ごとに持つ。`load()`（開く・プレビュータブの入れ替え）では捨てて「整形表示に入る」出来事にする。`reload()`（外部変更の読み直し）と下書きの復元では残して「中身が変わる」出来事にする（`reload()` は `this.file` を入れ替えるので、`file` に置くと前の整形表示と上限の印が消える）。覆す条件: なし。
- **P14 ソース表示で中身が変わったとき**: ソース表示の間に中身が変わったら（打鍵、外部変更）、途中の準備を捨て、次に整形表示に入るまで新しい準備を始めない（打鍵のたびに区間が動いて入力が引っかからないように）。中身が変わらずに整形表示に戻れば、続けていた準備をそのまま使う（仕様の「「整形中…」の間にソース表示へ切り替えても、準備は続ける」）。覆す条件: なし。
- **P15 測った値の決め方**: 描画の外で準備する大きさは、`check` が通った最大の測定点の半分を切り下げた値。整形表示の上限は、1 秒以上止まらなかった最大の測定点。測った文書は、バイト数と文字数の両方を記録する（2 つの値の大小は同じ文書の上で比べる）。覆す条件: なし。

- **P16 確かめ専用の窓（Step 7 から）**: [実機の確かめ](../spec/file-viewer/index.md#実機の確かめ)のとおり、作業者の画面は使わず、作業者の窓には何も送らない。手順（事実として確かめたもの）:
  - app home は Windows の形式のパス `%USERPROFILE%\.config\herdr-app-playground`（作業者が許して一度作った。フォルダはある）。
  - 起動: PowerShell で `$env:HERDR_APP_HOME` をそのフォルダにして、`Start-Process` で `herdr-app.exe` を**最小化せずに**起動する。herdr-app は前の位置を覚えていても窓を画面の中に戻すので、起動の直後に、前面にしないまま画面の外へ動かす（Win32 の `SetWindowPos(hwnd, HWND_BOTTOM, -8000, -8000, 0, 0, SWP_NOSIZE|SWP_NOACTIVATE)`）。最小化しない（最小化すると描かなくなり、`shot` が古い画面になる）。最小化からは戻さない（戻す手順で一度前面を取った）。
  - 起動は作業者の許可を得てから、**そのたびに止まって作業者に聞く**（起動の瞬間に前面を取りうるため。仕様の決まり）。最初の起動のときに Step 7〜13 の間開いたままにする許可を取り、確かめが全部終わるまで閉じない。終わったら `window.close` で閉じる。
  - 操作は、その窓だけに Win32 の `PostMessage`（`WM_MOUSEMOVE`・`WM_LBUTTONDOWN/UP`・`WM_MOUSEWHEEL`。座標はクライアント座標）で送る。`SendInput`・`SetCursorPos`・`AppActivate`・`SetForegroundWindow` は使わない。倍率は、ctrl+ホイールではなく、拡大の窓や `.mmd` の倍率のボタンを押して変える（ctrl を PostMessage で送れるかは確かめていない）。文字の入力（ソース表示での編集）を PostMessage（`WM_CHAR` など）で送れるかは Step 7 で確かめ、送れなければ、ソース表示の間の変化は外から書き換える形で確かめる（仕様にも「ソース表示の間に外から書き換えられてから戻ったとき」がある）。
  - 見る・入れる: WSL から `HERDR_APP_HOME='<Windows の形式のパス>' WSLENV=HERDR_APP_HOME` を付けて `herdr-app.exe` の `status`・`ls`・`do`・`shot`・`check` を呼ぶ。`scripts/deploy.sh` も同じく付けて流す（`deploy.sh` は `cmd.exe` で `%HERDR_APP_HOME%` を読む）。付け忘れると作業者の app に入れ直すことになる（禁止。作業者の app のメモリも減る）ので、環境変数を付けて呼ぶ小さなラッパー（例: `pg.sh` の関数）経由でだけ呼ぶ。
  - 守る: playground への操作のたびに、その直前と直後で、作業者の窓の `status` の `space` と `tab`、前面の窓のプロセス（`fg.ps1` など）を取って比べ、`.agents/scratch/playground/guard-log.txt` に追記する（仕様の確かめ方の記録）。操作の前後で作業者の窓が変わった、または前面が playground になったら、その操作をやめて返す（操作と操作の間に作業者の窓が変わるのは作業者の操作なので気にしない）。
  - 確かめのタブは machine `wsl` の確かめ専用のスペース（`space.new`）に開き、終わったら `space.close`（`confirmed: true`）で閉じる。そのスペースのタブは作業者の窓にも並ぶ（スペースとタブは herdr-core で共有）。作業者の app がそのタブのぶん file-viewer のコピーを作るかは確かめていないので、確かめのタブは少なく保ち、Step 7 で作業者の窓の `ls` を前後で見ておく。
  - playground の中でだけ、layout の反映（`scripts/deploy.sh layout` を同じ環境変数で）と `layout.switch`、テーマの切り替え（`do app.theme`）を使ってよい（ツリーとテーマの確かめのため）。作業者の窓には使わない。
  - mod の入れ直しのたびに playground のメモリが減って戻らない（ガイドの「メモリ」）。deploy の前に確かめのタブを閉じる。`status` に `out of memory` が出る、表示に `Null"null"` が出る、playground が落ちる・描かなくなったときは、製品の不具合と取り違えず、止まって作業者に再起動の許可を求める。
  - 使い捨ての道具の例（無くても上から作れる）: メインのチェックアウトの `.agents/scratch/playground/`（`README.md`、`pg.sh`、`fg.ps1`、`move.ps1`、`post.ps1`）。
  - Step 7 で、この手順をガイドに書く（仕様の「手順はガイドに書く」）。
  覆す条件: なし。
- **P17 SVG の作り**: 配置（`lib/mermaid/layout.js` の layout）から SVG の文字列を作る関数を lib に置く（`herdr`・`gpui-kit` を import しない）。描く中身は今の `views/mermaid.js` の `diagram` と同じ（flowchart の形ごとの箱・subgraph の枠と題名・線・点線・太線・矢じり・ラベル、sequenceDiagram の参加者・生存線・活性化・メッセージ・自分への矢印・alt/else/opt/loop の枠・注記、`style`/`classDef`/`class` の色）。色はテーマの色を `fill`/`stroke`（不透明度は `-opacity`）に書き込む。SVG の `width`/`height` は書き出しの大きさ（P27）、`viewBox` は配置の大きさにする（大きさだけ変えれば同じ絵を書き出せる）。字体は Step 7 で決めたものを `font-family`・`font-weight` に書く。文字の幅の見積もり（`lib/mermaid/layout.js` の `textWidth`）がその字体に合わないと Step 7 で分かったら、見積もりをその字体に合わせて直す（箱からはみ出させないため）。覆す条件: なし。
- **P18 SVG の名前と消し方**: 名前は `<タブの token>-<ハッシュ 12 桁>.svg`。ハッシュは「図のソース・テーマの色・書き出しの大きさ」から作る（最初の行は入れない。配置に効かないので、図より上の行が変わっても名前を変えず、書き直さない）。色か大きさが変われば名前が変わり、上書きしない。今の `sweepCaches` と `CACHE_NAME` に乗せる（起動後に、どのタブも使っていないものを消す）。整形表示の中で使わなくなった SVG（差し替えの前の絵、前の色の絵、前の大きさの絵）は、差し替えが済んだあとの掃除で消す（拡大の窓が書いたもの（P21）は消さない）。タブを閉じたら、`close()` で自分の token の SVG を全部消す（今の `close()` は画像のコピー 1 つしか消さず、`sweepCaches` は 30 秒ごとに別の表示中の viewer のタブからしか動かないため）。表示に使う SVG があるかは、整形表示に入るときと表示に戻ったときに描画の外で確かめ、無ければ書き直す（書き直す間の見え方は、書いていない図があるときと同じ）。覆す条件: なし。
- **P19 書き出しの置き場所**: SVG の書き出しは、`lib/prepare.js` の準備の続きとして、描画の外の非同期処理（今の `runPreparation`。描画の中で準備した小さな文書は、そのあとの非同期処理）で、図ごとに `fs.writeFile` を `await` して行う（入出力の `await` が区切りにもなる）。書き出しにかかった時間も、10 秒の数え方（P6）に入れる。書き出しの判断（どの図をまだ書いていないか、全部そろったか、どの名前を出すか、書いてある図を書き直さないこと）は lib に置いてテストする。覆す条件: なし。
- **P20 小さな文書の待ち**: 描画の外で準備する大きさ以下の文書は、描画の中で `parts` まで作り、まだ書いていない SVG があれば、仕様の[整形の準備](../spec/file-viewer/viewers.md#整形の準備)の場面ごとの見え方で待つ。開く・プレビュータブの入れ替えの「読み込み中…」は、今の読み込み中の表示（`file.loading` の間の表示）と同じものを、書き終わるまで出し続ける形で作る。覆す条件: なし。
- **P21 拡大の窓の SVG**: 図を押したら、タブのコピーが、窓に収まる大きさの SVG を書いてから overlay を開く（1 秒たっても書けなければ、本文の SVG を引き伸ばさずに本来の大きさで出して開き、書けたら替える）。props には、タブの token、図のソースと最初の行、書いた SVG の名前、配置の大きさ、テーマの色を渡す。窓のコピーは、倍率が変わったら、持っている SVG の文字列の `width`・`height` だけを替えて書く（配置し直さない）。テーマが変わったら（窓のコピーが描画で `theme()` の変化に気づく）、受け取ったソースを `lib/overlay-layout.js` の `OverlayLayout` で描画の外で配置し直して新しい色で書く（前の色の絵のまま待ち、失敗と 10 秒は知らせる）。窓が書く SVG の名前は、タブの token に窓の印を付けたもの（`CACHE_NAME` と `sweepCaches` がそれを見分けられる形にする。タブが開いている間は `sweepCaches` で消さない）にし、窓のコピーの `close()`（overlay が消えるときに呼ばれる。ガイドの「閉じるときの呼び出し」）で自分が書いたものを消す。タブ側は窓が閉じたことを知らなくてよい。窓の中の「図を書き出せなかった」の知らせは窓の中に出す。窓の大きさに収める倍率は、窓の大きさが分かってから決まるので、最初の書き出しの大きさは窓の大きさ（`openOverlay` の width・height の割合と、タブの窓の大きさ）から見積もり、ずれたら書き直す（書き直す間は前の絵の大きさのまま）。覆す条件: なし。
- **P22 テーマの切り替えの検出**: 描画のたびに `themeKey(t)` を前の値と比べ、変わったら、今の中身の図を新しい色で書き出し直す準備を始める（[色](../spec/file-viewer/mermaid.md#色)）。`themeKey` に図の色に使う色がすべて入っていないなら、図の色に使う色を全部入れた鍵を別に作る。playground ではテーマを `do app.theme` で変える。覆す条件: なし。
- **P23 .mmd の準備**: `.mmd` の図も、Markdown と同じ `MarkdownState` の考え方（図に入る・中身が変わる・区間・見張り・10 秒・テーマの書き直し）で、図 1 つの文書として扱う（作りを 2 つにしない）。描けない図は、今の `diagramError` と同じ出し方に、理由の 2 つ（図の準備が終わらなかった・図を書き出せなかった）を足す。倍率の書き出し直しは拡大の窓（P21）と同じく `width`・`height` だけを替える。覆す条件: なし。
- **P24 部品で描く図の片付け**: 置き換えたあと使われなくなる `views/mermaid.js` の `diagram`（要素で描く部分）を Step 13 で消す。`lib/overlay-layout.js` はテーマの書き直しで使うので残す（P21）。`main.js` の `layoutOf` と `this.diagrams` は、Step 12 のあとどこからも使われなければ消す。配置の lib は残す。覆す条件: なし。
- **P25 比べる元の画像**: Step 7 で、ブランチの今の HEAD（部品で描く作り）を playground に入れ、見本の図（flowchart の形の一通り・subgraph・ラベル・色指定・日本語、sequenceDiagram の一通り）を、整形表示・拡大の窓（等倍と、倍率のボタンで 3 倍ほど）・`.mmd` で撮り、メインのチェックアウトの `.agents/scratch/fv-check/compare/` に置く（コミットしない）。Step 13 で同じ見本を SVG の作りで撮り、並べた画像を作業者に見せる。覆す条件: なし。
- **P26 SVG の作りでの値の測り直し**: 描画の外で準備する大きさ（文字数・図の数）と整形表示の上限の図の数を、P15 の決め方と[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)の測り方（撮る間隔 200 ms 以下、上限の近くは 3 回）で、playground で測り直す。描画の外で準備する大きさは、そのまま開くと描画の外に回って測れないので、測る間だけ `PREPARE_IN_RENDER` を大きくした版を playground に入れ、interrupted が出ない最大を探して半分にし、測り終えたら定数を新しい値にした版を入れ直す（文字数も同じく playground で測り直す。`check` では SVG の書き出しが動かないため）。整形表示の上限の図の数は、`RENDER_LIMIT` の図の数を測る間だけ大きくした版で測る。バイト数の上限は今の値のまま（仕様のとおり）。覆す条件: なし。
- **P27 本文の図の書き出しの大きさ**: 本文の図は、`min(配置の幅, 本文の幅)` に画面の拡大率を掛けた大きさで書き出し、その大きさ（拡大率で割った論理の大きさ）で出す（[描く図](../spec/file-viewer/mermaid.md#描く図)の「本文の幅に収まるよう縮めて置く」を、縮めた絵を見せずに満たすため）。本文の幅は、今の `markdownBody` の `on_size_change` で覚える幅を使い、まだ分からないとき（小さな文書の「読み込み中…」の間など）は窓の描ける大きさ（`window.viewport_size()`）から余白を引いて見積もる。幅が変わったら（窓の大きさを変えたなど）、`MarkdownState` の出来事として扱い、前の大きさの絵のまま新しい大きさで書き直して差し替える（書き直す間に前の絵が本文の幅からはみ出すことは受け入れる。引き伸ばしも縮めもしないため）。覆す条件: 作業者が、幅を変えた直後に絵がはみ出すのを嫌うとき。
- **P28 Step 9〜13 の確かめの分け方**: 各ステップの「Shown by」は、自動で確かめるもの（`bun test`・deploy の `check`・`status`）にする。単体テストは Done when の「下のテストが通る」に、playground で `shot` を見る確かめは Done when の項目として置き、結果（撮った画像のパスと見たもの）を終わりの報告に書く。覆す条件: なし。
- **P29 受け入れのやり方**: 受け入れも playground で行い、実装者が P16 の手順で操作して撮った画像を作業者に見せる。作業者の app には受け入れまで mod を入れない（作業者の画面を使わない仕様の決まりと、入れ直しのたびに作業者の app のメモリが減るため）。覆す条件: 作業者が、受け入れは自分の窓で見たいと言ったとき（そのとき作業者の app に 1 回だけ入れる）。

## Scope of change

- `mods/file-viewer/lib/markdown.js`（区切りながらの準備に合わせた分け方）、新しい lib のファイル（区切りながらの準備、見え方の決まり、整形表示の上限の判定。名前は実装者に任せる）
- `mods/file-viewer/views/markdown.js`（準備の結果から描く、「整形中…」、代わりの整形表示）
- `mods/file-viewer/main.js`（準備の始め方と区切り、見え方、知らせ、整形表示の上限、ソース表示のボタン、SVG の書き出しと掃除、拡大の窓、`.mmd`、テーマ）
- `mods/file-viewer/views/mermaid.js`（部品で描く図を消し、SVG 画像で出す。Step 13）、`mods/file-viewer/views/zoom.js`（拡大の倍率の書き出し直しのため、要るなら）、`mods/file-viewer/lib/overlay-layout.js`（拡大の窓のテーマの書き直しで使う。Step 11）、`mods/file-viewer/io.js`（SVG の書き出し）
- `tests/`（既存の `markdown-links.test.js` に足すか、新しいファイル）
- `docs/guides/herdr-app-mod-development.md`（Step 1 と実装で測った値と事実）
- `docs/README.md`（この計画への 1 行。計画を消すときに一緒に消す）
- 作業者の app home の `mods/file-viewer/`・`mods/file-tree/`（反映先。Step 7 からは受け入れの前まで入れない）、測る間だけの app home の `mods/fv-probe/`・`fv-probe-result.json` と、リポジトリの未追跡の `mods/fv-probe/`（P1。Step 1〜6）
- playground の app home（`%USERPROFILE%\.config\herdr-app-playground`）の `mods/`（Step 7 から。P16）
- メインのチェックアウトの `.agents/scratch/`（ignore 済み。確認用リポジトリ `fv-check/` に見本の Markdown を足す。測るためのスクリプト）

app home のそれ以外のファイル（同梱 mod、同梱 layout、`keys.json`、`settings.json`、`shared.json`）は直接編集しない。

## Step order and prerequisites

1 → 2 → 3 → 4 → 5 → 6（実装済み）→ 7 → 8 → 9 → 10 → 11 → 12 → 13。各ステップの「Shown by」が通らなければ次に進まない。Step 10・11 は Step 9 の後で互いに独立（順は 10 → 11）。Step 12 は Step 10・11 の仕組みを使うので、その後。

Step 1〜6 の実機での確認は作業者の herdr-app（Windows）と WSL の space で行った（[共通の前提](../spec/file-viewer/index.md#共通の前提)）。Step 7 からは P16 の確かめ専用の窓で行い、下の Step 1〜6 の書き方（作業者の窓・P3）には従わない。作業者は使用中なので、作業者のタブ・ペイン・space を閉じない。作業者の窓の layout は切り替えない。作業者の herdr-app は再起動しない（再起動後の振る舞いは単体テストと受け入れ 11 で確かめる）。Step 1〜6 では、実装者が開いたタブは確かめが終わったら閉じて作業者がもともと見ていたタブに戻し、画面を使う確かめ・重い文書を実機の窓で開く確かめ・表示を切り替える `tab.new` は、P3 のとおり始める前に作業者に確かめた。Step 7 からは、作業者の窓には何も送らない（`tab.new`・`tab.select` も送らない）。確かめのスペースを閉じるだけにする（P16）。

## 実装済みのステップ（Step 1〜6）

Step 1〜6 はコミット dcb1cdb〜ac18cfa で実装し、レビューと受け入れの確かめ（一部）を済ませた。やり直さない。下の Step 1〜6 の本文は、そのときの記録として残す。受け入れの確かめで分かったこと: 図 100 個の文書は部品で描く作りでは描き直しで interrupted になる（Step 1 の (4) の値 100 個は小さな図だけを並べた文書で測ったもので、実際の文書では成り立たなかった）。これを受けて仕様を改め（コミット d41fc0d）、Step 7〜13 を足した。

## Step 1 — 実機で値と事実を測る

Purpose: 描画の外で準備する大きさと整形表示の上限の値、差し替えでスクロールが保たれるかを、実機で測ってガイドに書く。Specification: [整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)。
Prerequisites: herdr-app が起動していて、WSL の space があること。(3)〜(6) の前に、作業者に手を離してもらえるかを確かめる（P3）。
May change: `docs/guides/herdr-app-mod-development.md`、メインのチェックアウトの `.agents/scratch/`（見本と、P3 の測るためのスクリプト）、測る間だけリポジトリの `mods/fv-probe/`（未追跡）と app home の `mods/fv-probe/`・`fv-probe-result.json`。
Done when: 次の値と事実が、ガイドの「制約」の表（「描画の時間」の行への追記か新しい行）に、測った文書の中身と一緒に書いてある。
(1) 画像やバッジの多い Markdown で、今の整形の準備を初回描画の中でして `check` が通る最大の文字数（P2）。P15 で描画の外で準備する大きさの文字数の仮の値にする（Step 6 で測り直す）。
(2) 図だけを並べた Markdown で、同じく通る最大の図の数。同じく図の数の仮の値にする。
(3) 見出し・表・コードブロック・リンクを含み図の無い Markdown を、整形の準備をせずに `TextView.markdown` で開いたとき、開いたときとスクロールしたときに app が 1 秒以上止まらない最大のバイト数（P3 の測り方と上げ方）。P15 で整形表示の上限のバイト数にする。
(4) 図だけを並べた Markdown で、配置を済ませた図を描いて、同じく 1 秒以上止まらない最大の図の数。P15 で整形表示の上限の図の数にする。
(5) 整形表示を少し下までスクロールしてから中身を差し替えたとき（同じ要素の id のまま）、スクロールの位置が保たれるか。
(6) (1) の大きさの前後の文書を実機の窓で開き、`check` の結果と同じところで止まるか（P2 の確かめ）。
測った文書のバイト数と文字数の両方と、同じ文書の上での値の大小（整形表示の上限が描画の外で準備する大きさ以下か）も書いてある。確かめの後、リポジトリと app home の `mods/fv-probe/`、`fv-probe-result.json`、開いたタブが残っていない。
Shown by: artifact — `docs/guides/herdr-app-mod-development.md` の追記。あわせて `herdr-app ls` に `fv-probe` のタブが無く、app home（`scripts/deploy.sh` と同じ求め方。`HERDR_APP_HOME` があればそちら）の `mods/` に `fv-probe` が無く、app home 直下に結果のファイルが無く、app home の `layouts/` の中身が測る前と同じで、リポジトリに `mods/fv-probe/` が無いこと。
Left to the implementer: 確かめ用の mod の書き方、見本の文書の中身（ただし (1)〜(4) の文書の組み立ては上のとおり）、大きさの刻み方。
Stop and hand back if: 作業者が画面を使う確かめを今は許さないとき（P3 の覆す条件のとおり、仮の値で進めるかを作業者に聞く）。(3) のバイト数が、ふつうの README（30 KB ほど）より小さいとき（整形表示できる文書が今より大きく減るので、仕様の見直しが要るかを作業者に聞く）。(4) の図の数が 66 未満のとき（仕様の成功条件「今の作りで覚えておける 64 個を超える図があるもの」も整形表示が出る、と食い違うので brainstorm に戻す）。測っている間に app が 10 秒以上戻らない、または落ちたとき（P3）。

## Step 2 — 区切りながら準備する処理

Purpose: 整形の準備を、時間の予算で区切りながら進められ、一度に準備したときと同じ結果になる処理にする。Specification: [整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)。
Prerequisites: Step 1（整形表示の上限の値。この処理自体は値に依らない）。
May change: `mods/file-viewer/lib/markdown.js`、新しい lib のファイル、`tests/`、`docs/guides/herdr-app-mod-development.md`（測った時間）。
Done when: 下のテストが通る。P4 の作りで、文章の部分の書き換えた Markdown と図ごとの配置（か失敗）の並びを返す。今の `rewriteImages` と `splitMermaidBlocks` の外から見た結果（既存のテスト）は変わらない。描画の外で準備する大きさと整形表示の上限の判定（文字数・図の数・バイト数を数え、Step 1 の値と比べる。超えたら、ちょうどは含まない）が lib にあり、値はコードの定数にある。quickjs-emscripten などで、Step 1 の (3) の見本の形（画像やバッジを足したもの）で整形表示の上限の大きさの文書の準備を 100 ms の予算で区切ったとき、1 区間が予算を大きく超えないことと、P9 の判定の全体の時間（1 MiB の文字列で 10 ms 以下）を測ってガイドに書いてある（quickjs-emscripten を使うなら、リポジトリには足さず `.agents/scratch/` の外の一時の場所に入れる）。
Shown by: test — RED → GREEN → REFACTOR で `bun test`:
- 画像・バッジ・参照形式・HTML のかたまり・`<picture>`・コードブロック・図を含む文書で、予算を小さくして何度にも分けて進めた結果が、予算無しで一度に進めた結果と同じ（`<picture>` がかたまりをまたぐ場合と、図の境目をまたぐ場合を含む）（[整形の準備](../spec/file-viewer/viewers.md#整形の準備) の「結果は、描画の中で一度に準備したときと同じ」）
- 予算無しで一度に進めた結果の文章の部分が、今の `collectDefinitions` + `splitMermaidBlocks` + 部分ごとの `rewriteImages` の結果と同じ（[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像) の振る舞いを変えない）
- 図の解析・配置に失敗した図は、その図だけが失敗として結果に入り、ほかの図と文章は結果に入る（[描けない図](../spec/file-viewer/mermaid.md#描けない図)）
- 文字数と図の数のどちらも描画の外で準備する大きさ以下なら描画の中、どちらかが超えたら描画の外（ちょうどの値は描画の中）（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
- バイト数か図の数のどちらかが整形表示の上限を超えたら整形表示をしない（ちょうどの値は整形表示をする）。バイト数は UTF-8 の大きさ（日本語・4 バイトの絵文字を含む文字列で、`Buffer.byteLength` などで出した値と同じ）（[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)）
Left to the implementer: 単位の分け方の細部、関数とファイルの名前、予算を超えないための確かめ方の細部。
Stop and hand back if: Step 1 の (3) の見本の形で整形表示の上限の大きさのとき、1 つの単位（かたまり 1 つ、図 1 個）だけで 200 ms を超えるとき（区切っても 1 区間が長くなり、仕様の「1 区間を 100 ms ほどまで」を守れないため）。空行の無い巨大な段落のような、README として現実的でない形はこの基準に含めない。

## Step 3 — 見え方の決まり

Purpose: 整形表示に入るときと中身が変わるときに何を出すか、準備の途中で中身が変わったら何をするか、いつ失敗とするかを、lib の 1 か所で決める。Specification: [整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)。
Prerequisites: なし（Step 2 と独立。順は Step 2 の後）。
May change: 新しい lib のファイル、`tests/`。
Done when: 下のテストが通る。決まりは、出来事（整形表示に入る、整形表示を出したまま中身が変わる、ソース表示で中身が変わる、区間が進む、準備が終わる、例外、表示しなくなる・戻る、ソース表示のボタンを押す）を受けて、出すもの（すぐ整形表示・「整形中…」・前の整形表示・代わりの整形表示・ソース表示）と、準備を捨てる・続ける・やり直す、知らせ（P11 の 3 つ）を返す。
Shown by: test — RED → GREEN → REFACTOR で `bun test`。各項目の根拠は [整形の準備](../spec/file-viewer/viewers.md#整形の準備) の「準備が終わるまでの見え方」「失敗したとき」と、[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)。P6・P8・P12・P14 の仮の答えもここで確かめる:
- 整形表示に入るとき（開く、ソース表示から戻る、プレビュータブの中身が入れ替わる）、今の中身の準備が済んでいればすぐ整形表示、済んでいなければ「整形中…」。前の中身の整形表示は出さない
- 整形表示を出したまま中身が変わると、前の整形表示を出し続け、準備が終わると新しい結果に差し替える
- 「整形中…」の間に中身が変わると、途中の準備を捨てて今の中身でやり直す。「整形中…」から出す結果は今の中身のものだけ
- 前の整形表示を出している間に中身が変わると、途中の準備を最後まで続けて差し替えてから、今の中身でやり直す（書き換えが続いても、表示が新しい中身に進む）
- 「整形中…」の間にソース表示へ切り替えても準備は続き、何も変えずに戻ると、済んでいればすぐ整形表示
- ソース表示の間に中身が変わると、途中の準備を捨て、整形表示に入るまで新しい準備を始めない（P14）
- 表示しなくなったら区間を進めず、戻ったとき中身が同じなら続きから進める
- 準備を動かしている時間が 10 秒を超えたら失敗とし、代わりの整形表示と「終わらなかった」知らせにする。表示していなくて止めている間の時間は数えない。やり直したり次の中身に進んだりしたら 0 から数える（P6）
- 代わりの整形表示の並びは、今の内容をそのまま 1 つの文章の部分にしたもので、図の部分が無い（P12）
- 画像を押せる名前にする処理が例外を投げたら、代わりの整形表示と「画像を押せる名前にできなかった（理由）」の知らせ。理由は例外のメッセージ。知らせは整形表示のときだけ出て、次の準備が失敗せずに終わると消える
- 整形表示の上限: 整形表示に入るときに超えていればソース表示と理由の知らせ。整形表示のまま中身が変わって超えたらソース表示に移す。上限で移したソース表示のまま中身が変わって下回ったら、ソース表示のまま、知らせを消して整形表示のボタンを出す。利用者が選んだソース表示は、上限を下回っても変えず、上限を超えている間は理由の知らせを出しボタンを出さない（P8）
Left to the implementer: 決まりの表し方（状態と出来事の関数など）、名前。
Stop and hand back if: none。

## Step 4 — 画面へのつなぎ

Purpose: Step 2・3 を `main.js` と `views/markdown.js` につなぎ、大きな文書を描画の外で準備して出す。Specification: [整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[下書き](../spec/file-viewer/editing.md#下書き)、[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)。
Prerequisites: Step 3。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/views/markdown.js`、`mods/file-viewer/lib/`（つなぎで要る小さな足し）、`tests/`。
Done when: 準備の状態が P13 のとおりビューの入れ物にあり、`load()` では捨てられ、`reload()` と下書きの復元では残る。描画の中で済ませる文書は、今までどおり描画の中で準備して出る。描画の外で準備する文書は、P5 のとおり `cx.spawn` で区切りながら準備し、その間は「整形中…」（進み具合なし）、終わったら整形表示が出る。`markdownBody` が準備の結果から描き、描画の中で `layoutOf` を呼ばない（P4）。前の整形表示を出す場面で、部品の要素の id が変わらない（P10）。表示していないタブでは区間を進めない（P7。区間ごとに `identify()` で取り直す）。失敗の知らせが帯で出る（P11）。代わりの整形表示は P12 のとおり。図を押したときの拡大の窓は、押したときの図の中身で開く（今の `openDiagram` のまま）。そのうえで実機の確認（下）が通る。
Shown by: check — 順に `bun test`（全件）、`scripts/deploy.sh file-viewer`（`check passed`）、`scripts/deploy.sh file-tree`（`check passed`）。続けて実機（WSL の space、メインのチェックアウトの `.agents/scratch/fv-check/` に置いた見本）で、作業者に確かめてから（P3）`herdr-app do tab.new` で開いて `herdr-app shot` を見る: 描画の外で準備する大きさを超える画像の多い文書が「整形中…」のあと整形表示になり、「interrupted」が出ない。図の多い文書（100 個ほど）も整形表示になる。ふつうの README はすぐ整形表示になる。開いたまま WSL のターミナルで追記すると、2 秒ほどで新しい中身に差し替わる。
Left to the implementer: 区切りに使う入出力（P5 の範囲内）、ビューの入れ物の中の状態の形（P13 の範囲内）。
Stop and hand back if: 描画の外の処理から `cx.notify()` しても、描き直しが起きないとき（「整形中…」から先に進められないため）。Step 1 で整形表示の上限が描画の外で準備する大きさ以下だったときは、描画の外の準備は使われないので、上の実機の確かめのうち「整形中…」を経る見本は作れない。その旨をガイドと終わりの報告に書き、作業者に伝える（止めない。単体テストは同じに行う）。

## Step 5 — 整形表示の上限

Purpose: 整形表示の上限を超える Markdown をソース表示で開き、理由を出し、上限をまたいだときの切り替えを仕様どおりにする。Specification: [整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)、[プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)。
Prerequisites: Step 4。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/lib/`、`tests/`。
Done when: 上限を超える Markdown はソース表示で開き、上限の値と今の大きさ（超えたほう）の帯が出て、整形表示に切り替えるボタン（今の `fv-source`）が出ない。上限で移したソース表示は P8 のとおりタブの記録の `mode` に書かれない。上限を下回るとボタンが出て帯が消え、表示はソースのまま。利用者が選んだソース表示はそのまま。プレビュータブの中身が上限を超えるファイルに入れ替わるとソース表示。再起動後は記録の `mode` から始めて上限を比べ直す。上限の判定は中身が変わるたびに（ソース表示の打鍵でも）行い、Step 2 で測った判定の時間（1 MiB で 10 ms 以下）に収まる。利用者が選んだソース表示でも、上限を超えている間は帯が出てボタンが出ない（P8）。そのうえで実機の確認（下）が通る。
Shown by: check — 順に `bun test`（全件）、`scripts/deploy.sh file-viewer`（`check passed`）、`scripts/deploy.sh file-tree`（`check passed`）。続けて実機で、作業者に確かめてから（P3）`tab.new` と `herdr-app shot` を見る: 上限を超える見本を開くとソース表示で帯が出て、整形表示のボタンが無い。そのファイルを WSL のターミナルで上限より小さく書き換えると、帯が消えてボタンが出る（表示はソースのまま）。app home の `shared.json` の `file-viewer:tabs`（WSL から読むだけ。書かない）で、そのタブの記録の `mode` が `source` になっていない。
Left to the implementer: 帯の文言（[任せたこと](../spec/file-viewer/viewers.md#任せたこと)）、状態の名前。
Stop and hand back if: none。

## Step 6 — 通しの確認とガイドの更新

Purpose: 全体を反映して既存の振る舞いが壊れていないことと、止まらないことを実機で確かめ、受け入れの準備をする。Specification: このページの Specification のすべて。
Prerequisites: Step 5。
May change: `docs/guides/herdr-app-mod-development.md`、`mods/file-viewer/lib/`（描画の外で準備する大きさの定数）、`tests/`（定数に合わせる場合）、メインのチェックアウトの `.agents/scratch/`、測る間だけ P1 の `fv-probe`。
Done when: 下の check がすべて通る。新しい準備の処理を使う `fv-probe`（P1）で Step 1 の (1)・(2) を `check` で測り直し、描画の外で準備する大きさの定数とガイドを、その値（P15）に直してある。P3 の道具で（始める前に作業者に確かめる）、整形表示の上限より少し小さい見出し・表の多い文書と図の多い文書を開いてスクロールし、1 秒以上止まらないことと、描画の外の準備の間もスクロールが引っかからないこと、差し替えのときのスクロールの位置を見て、結果がガイドにある。[受け入れの操作確認](#受け入れの操作確認) のための見本が `.agents/scratch/fv-check/` にそろい、項目ごとに見るものが添えてある。実装で分かった事実がガイドの「制約」にある。実装者が開いたタブが残っていない。
Shown by: check — 順に `bun test`（全件）、`scripts/deploy.sh file-viewer`、`scripts/deploy.sh file-tree`、`herdr-app status` の `errors` が空、`herdr-app ls` に実装者が開いたタブが無い。
Left to the implementer: 見本の中身。
Stop and hand back if: 整形表示の上限より小さい文書で 1 秒以上止まるときは、測り直して定数とガイドを直し、Step 6 をやり直す（値は仕様に書かないので仕様は直さない）。やり直しても止まるなら止めて返す。作業者が画面を使う確かめを許さないときは、画面の確かめを受け入れに回し、その旨を終わりの報告に書く（止めない）。

## Step 7 — 確かめ専用の窓の手順、比べる元の画像、使える字体

Purpose: 確かめ専用の窓の手順をガイドに書き、部品で描く今の図を撮っておき、SVG で今の図と同じ字体を使えるかと文字の幅を確かめる。Specification: [実機の確かめ](../spec/file-viewer/index.md#実機の確かめ)、[描き方](../spec/file-viewer/mermaid.md#描き方)。
Prerequisites: Step 6（実装済み）。playground を起動する前に、作業者に許可を取る（P16。起動の瞬間に前面を取りうるため、**止まって作業者に聞く**）。
May change: `docs/guides/herdr-app-mod-development.md`、メインのチェックアウトの `.agents/scratch/`（`fv-check/compare/`、見本、使い捨ての道具、`playground/guard-log.txt`）、playground の app home の `mods/` と `layouts/`。
Done when: 次がそろっている。
- ガイドに確かめ専用の窓の手順がある（P16 の事実: 起動、画面の外への動かし方、してはいけないこと、操作の送り方、見方、守ること、スペースの開き方と閉じ方、メモリが減ったときの扱い）。
- PostMessage で、倍率のボタンが押せるか、ソース表示に文字を入力できるか（`WM_CHAR` など）を playground で確かめ、結果がガイドにある（入力できなければ、P16 のとおり外からの書き換えで代える）。
- playground に `main-viewer` の layout と file-tree を入れて切り替え（P16）、ツリーが出ることを `shot` で見てある。作業者の窓の `ls` を確かめの前後で見て、確かめのタブが作業者の app に与えた影響（file-viewer のコピーを作ったか、エラーが出たか）が分かる範囲でガイドにある。
- `.agents/scratch/fv-check/compare/` に、P25 の見本を、部品で描く作り（ブランチの今の HEAD）で撮った画像がある。
- 今の図の字体（app の UI の字体。テーマと設定から分かるもの）を調べ、同じ `font-family`・`font-weight` を指定した使い捨ての SVG を `fv-check/` に置いて playground の file-viewer の image viewer（`.svg` は画像として開く）で開き、英数字・日本語・太字の見本の文字が出ること、その文字の幅（`shot` の画像から測ったもの）を、今の `textWidth` の見積もりと並べてガイドに書いてある。同じ字体にできないときは、いちばん近い字体を選び、その字体の SVG と比べる元の画像を並べた画像も `compare/` に置く（作業者に見せるのは Step 13）。
- 操作の前後の記録が `guard-log.txt` にあり、確かめ専用のスペースを閉じてある。
Shown by: artifact — `docs/guides/herdr-app-mod-development.md` の追記と `.agents/scratch/fv-check/compare/` の画像と `guard-log.txt`。
Left to the implementer: 見本の文書の中身（P25 の種類は入れる）、撮る倍率の細部。
Stop and hand back if: 作業者が playground の起動を許さないとき。playground の窓が、最小化しないのに描かなくなったとき（`shot` が変わらない）。PostMessage で倍率のボタンも押せないとき（拡大の確かめができないため）。

## Step 8 — 配置から SVG を作る

Purpose: 配置した図から、今の図と同じ中身の SVG の文字列を作る。Specification: [描き方](../spec/file-viewer/mermaid.md#描き方)、[色](../spec/file-viewer/mermaid.md#色)、[描く図](../spec/file-viewer/mermaid.md#描く図)。
Prerequisites: Step 7（使う字体と文字の幅）。
May change: `mods/file-viewer/lib/` の新しいファイル、`mods/file-viewer/lib/mermaid/layout.js`（`textWidth` を Step 7 で測った幅に合わせる。要るときだけ）、`tests/`。
Done when: P17 の作りで、下のテストが通る。
Shown by: test — RED → GREEN → REFACTOR で `bun test`。どれも [描き方](../spec/file-viewer/mermaid.md#描き方) の確かめ方「ノード・辺・文字・色が SVG の要素として出ること」による:
- flowchart の配置から作った SVG に、どのノードにも形の要素と名前の text があり、どの辺にも線と矢じりがあり、ラベルのある辺はラベルの text がある。点線・太線の辺はそれと分かる線になる。subgraph には枠と題名の text がある。
- sequenceDiagram の配置から作った SVG に、参加者の箱と名前（上と下）、生存線、活性化、メッセージの線と矢じりと文字（自分への矢印を含む）、注記、alt・else・opt・loop の枠と見出しがある。
- テーマの色が線・文字・枠に入る。`style`・`classDef`・`class` の色はそのノードに入る（[色](../spec/file-viewer/mermaid.md#色)）。
- 書き出しの大きさを変えても、絵の中身（要素と座標の比）は同じで、`width`・`height` だけが変わる。
Left to the implementer: SVG の要素の組み立て方の細部（要素の種類を含む）、関数の名前。字体の名前の入れ方。
Stop and hand back if: none.

## Step 9 — 整形表示の図を SVG で出す

Purpose: Markdown の整形表示の図を SVG 画像で出す。書き出しは整形の準備に含め、途中の空きを見せない。Specification: [描き方](../spec/file-viewer/mermaid.md#描き方)、[描く図](../spec/file-viewer/mermaid.md#描く図)、[整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[image viewer](../spec/file-viewer/viewers.md#image-viewer)、[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)。
Prerequisites: Step 8。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/views/markdown.js`、`mods/file-viewer/io.js`、`mods/file-viewer/lib/`、`tests/`。
Done when:
- 整形表示の図が `image(SVG のパス)` 1 つで、P27 の大きさで出る（`markdownBody` で `diagram` を呼ばない）。書き出しは P19 のとおり整形の準備の続きで行い、全部の SVG がそろうまでその中身の整形表示を出さない（待つ間は今の「整形中…」か前の整形表示）。小さな文書は P20 と仕様の場面ごとの見え方で待つ。本文の幅が変わったら P27 のとおり書き直す。
- SVG の名前と消し方は P18（タブを閉じたら `close()` で自分の SVG を消す、使わなくなった SVG を差し替えのあとに消す、無くなっていたら書き直す）。最初の書き出しの例外は、代わりの整形表示と「図を書き出せなかった（理由）」。この知らせは外部変更の知らせと並んで出る。
- 下の単体テストが通る。どれも [整形の準備](../spec/file-viewer/viewers.md#整形の準備) と [描き方](../spec/file-viewer/mermaid.md#描き方) による:
  - まだ書いていない SVG がある間、`MarkdownState` はその中身の整形表示を出さない。開く・プレビュータブの入れ替えでは読み込み中、ソース表示から戻るときは「整形中…」、出したまま変わったときは前の整形表示を出す。
  - SVG の名前は図のソース・色・書き出しの大きさで変わり、図より上の行が変わっても変わらない。書いてある図は書き直さない。
  - 本文の幅が変わったとき、新しい大きさで書けるまで前の大きさの結果を出し、書けたら替える。
  - 書き出しの待ちにも、表示しているときだけ動く・10 秒・待つ間の中身の変化の決まりが当たる。
  - 最初の書き出しの例外で、代わりの整形表示と「図を書き出せなかった」の知らせになる。
  - 出す SVG が無くなっていたら、書き直すまで書いていない図と同じに待つ。
- playground（P16。前後の記録を `guard-log.txt` に）で、図の多い文書・図のある小さな README・画像の多い README を開いて `shot` を見て、次を確かめ、撮った画像のパスと見たものを終わりの報告に書く:
  - 図がくっきり出て、空きが写らず、interrupted が出ない。
  - 小さな README は「整形中…」を経ない。
  - 外から追記すると、前の整形表示のまま差し替わる。
  - タブを閉じた直後に、`file-viewer-cache/` からその SVG が消えている。
Shown by: check — 順に `bun test`（全件）、P16 の環境変数を付けた `scripts/deploy.sh file-viewer` と `scripts/deploy.sh file-tree`（どちらも `check passed`）、playground の `status` の `errors` が空。
Left to the implementer: 書き出しの関数の置き場所（`io.js` か lib か）、待つ間の状態の表し方、本文の幅の取り方の細部（P27 の範囲）。
Stop and hand back if: `image(パス)` で、書き出したばかりの SVG が出ないとき（キャッシュの読み込みの都合など）。そのときは、どうすれば出るかを playground で確かめ、手が無ければ返す。

## Step 10 — テーマの切り替え（本文）

Purpose: テーマを変えたら本文の図を新しい色で書き出し直し、そろってからまとめて替える。Specification: [色](../spec/file-viewer/mermaid.md#色)。
Prerequisites: Step 9。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/lib/`、`tests/`。
Done when:
- P22 でテーマの変化を見つけ、[色](../spec/file-viewer/mermaid.md#色)のとおり書き出し直す。書き終わるまでは前の色の絵で、そろったらまとめて替え、「整形中…」にしない。表示しているときだけ動かし、10 秒で終わらなければ前の色の絵のまま「整形の準備が終わらなかった」、書き出し直しの失敗は前の色の絵のまま「図を書き出せなかった」と知らせる。途中で中身が変わったら新しい中身と色でやり直す。表示していない間に変わったら、表示に戻ったときに書き直す。
- 下の単体テストが通る（[色](../spec/file-viewer/mermaid.md#色) による）: テーマが変わったとき、そろうまで前の色の結果を出し、そろったらまとめて替わる。書き出し直しの失敗と時間切れで、前の色のまま知らせが出て、代わりの整形表示にならない。
- playground で `do app.theme` でテーマを切り替えて、図の多い文書の `shot` を続けて撮り、新旧の色が混ざった画像が無く、「整形中…」が写らないことを見る（結果を報告に書く）。
Shown by: check — 順に `bun test`（全件）、deploy（Step 9 と同じ 2 つ）、playground の `status` の `errors` が空。
Left to the implementer: なし。
Stop and hand back if: `app.theme` が playground の窓だけに効かず、作業者の窓のテーマも変わるとき（すぐ元のテーマに戻して返す）。

## Step 11 — 拡大の窓

Purpose: 図の拡大の窓を SVG で出し、どの倍率でもくっきり描き、引き伸ばした・縮めた絵を見せず、テーマの切り替えにも従う。Specification: [拡大表示](../spec/file-viewer/mermaid.md#拡大表示)、[描き方](../spec/file-viewer/mermaid.md#描き方)、[色](../spec/file-viewer/mermaid.md#色)。
Prerequisites: Step 9（テーマの扱いは Step 10 の考え方を使う）。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/views/zoom.js`、`mods/file-viewer/lib/`（`overlay-layout.js` を含む）、`tests/`。
Done when:
- P21 の作りで、図を押すと収まる大きさの SVG を書いてから窓が開き（1 秒たっても書けなければ本来の大きさで開いてから替える）、倍率を変えると書き終わるまで前の倍率の絵をその大きさのまま出して書けたら替え（続けて変えたら最後の倍率だけ）、書き出し直しの失敗と時間切れは前の絵のまま窓の中に知らせを出す。テーマが変わったら窓の図も前の色の絵のまま書き直して替える。窓が書いた SVG は窓の `close()` で消え、窓を開いている間はタブ側の掃除で消えない。
- 下の単体テストが通る（[拡大表示](../spec/file-viewer/mermaid.md#拡大表示) と [色](../spec/file-viewer/mermaid.md#色) による）: 倍率が変わったとき、書き終わるまでは前の倍率の絵と大きさを返し、書けたら新しい倍率の絵を返す。続けて変わったら最後の倍率だけ書く。書き出し直しの失敗と時間切れで、前の絵のまま知らせになる。窓を開くときに 1 秒たっても書けなければ、本来の大きさの絵で開く。テーマが変わったら、そろうまで前の色の絵を返す。
- playground で、`recover-60.md` などの図を PostMessage で押し、窓が開いた最初の `shot` に収まる大きさのくっきりした絵が出ていること、倍率のボタンで 3 倍以上にしたあと続けて撮った `shot` にぼやけた絵・空き・小さい絵が写らないこと、窓を閉じた直後に窓が書いた SVG が消えていることを見る（結果を報告に書く）。
Shown by: check — 順に `bun test`（全件）、deploy、playground の `status` の `errors` が空。
Left to the implementer: 収まる大きさの見積もりの細部（P21 の範囲）、窓の印の付け方（P21 の範囲）。
Stop and hand back if: overlay を開くのを、タブのコピーから SVG を書き終えるまで遅らせる方法が無いとき。

## Step 12 — .mmd

Purpose: `.mmd` も SVG で描き、配置と書き出しを描画の外でする。Specification: [Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)、[拡大表示](../spec/file-viewer/mermaid.md#拡大表示)、[色](../spec/file-viewer/mermaid.md#色)。
Prerequisites: Step 10・11（テーマと倍率の書き出し直しの仕組みを使う）。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/lib/`、`tests/`。
Done when:
- P23 の作りで、図に入るときは「整形中…」、出したまま中身やテーマが変わったときは前の図のまま差し替わる。10 秒（表示している間だけ）で終わらなければ描けない図の「図の準備が終わらなかった」、最初の書き出しの失敗は「図を書き出せなかった」になり、どちらも中身が変わったらやり直す。テーマの書き出し直しの失敗と時間切れは、前の色の絵のまま知らせる。倍率の書き出し直しは拡大の窓と同じ。
- 下の単体テストが通る（[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)、[色](../spec/file-viewer/mermaid.md#色) による）: 図に入るときは準備中、出したまま変わったときは前の図を返す。10 秒で「図の準備が終わらなかった」の理由になる。最初の書き出しの失敗で「図を書き出せなかった」の理由になる。テーマの書き出し直しの失敗と時間切れで、前の色のまま知らせになる。
- playground で、ノードが数百ある大きな `.mmd` と小さな `.mmd` を開いて `shot` を見て、interrupted が出ず、小さな図はすぐ（「整形中…」は一瞬）出ること、外から追記しても「整形中…」に戻らずに差し替わることを見る（結果を報告に書く）。
Shown by: check — 順に `bun test`（全件）、deploy、playground の `status` の `errors` が空。
Left to the implementer: なし。
Stop and hand back if: none.

## Step 13 — 片付け、値の測り直し、通しの確認

Purpose: 部品で描く図を消し、SVG の作りで値を測り直し、全体を確かめて受け入れの準備をする。Specification: [整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[描き方](../spec/file-viewer/mermaid.md#描き方)、[実機の確かめ](../spec/file-viewer/index.md#実機の確かめ)。
Prerequisites: Step 10・11・12。
May change: `mods/file-viewer/views/mermaid.js`、`mods/file-viewer/main.js`（`layoutOf` などの片付け）、`mods/file-viewer/lib/render-size.js`（定数）、`tests/`、`docs/guides/herdr-app-mod-development.md`、メインのチェックアウトの `.agents/scratch/`。
Done when:
- P24 のとおり、使われなくなった部品の描き方が消えている。
- P26 のとおり、描画の外で準備する大きさ（文字数・図の数）と整形表示の上限の図の数を playground で測り直し（撮る間隔 200 ms 以下、上限の近くは 3 回、図の数は開いた直後と重い文書を開いて閉じたあとの両方）、定数とガイドが新しい値になっている。測るために入れた版のあと、新しい定数の版を playground に入れ直してある。
- 図の数が上限ちょうどの文書で、開いたときもスクロールしたときも 1 秒以上止まらず、どの図も名前が全部出ることを playground の `shot` で見て、結果がガイドにある。
- P25 の見本を SVG の作りで撮り、`compare/` の部品で描いた画像と並べた画像がある（作業者に見せて決めてもらうため。Step 7 で字体が同じにできなかったときは、そのことも添える）。
- [受け入れの操作確認](#受け入れの操作確認)の見本と項目ごとに見るものが `.agents/scratch/fv-check/` にそろっている。確かめ専用のスペースが閉じてある。
Shown by: check — 順に `bun test`（全件）、deploy（playground）、playground の `status` の `errors` が空、playground の `ls` に確かめ専用のスペースが無い、ガイドの値と `render-size.js` の定数が同じ、`compare/` に並べた画像がある。
Left to the implementer: 見本の中身。
Stop and hand back if: 測った図の数の上限が 64 以下のとき（仕様の「整形表示の上限」のとおり仕様の見直しになる。brainstorm に戻す）。図の数が上限ちょうどの文書で 1 秒以上止まるとき（測り直して直し、やり直しても止まるなら返す）。

## 受け入れの操作確認

cycle の最後の受け入れで行う（P29）。見る画面は playground（確かめ専用の窓）で、実装者が P16 の手順で操作し、撮った画像を作業者に見せる。作業者が自分の窓で見たいと言ったら、そのときに作業者の app に入れる（入れ直しは 1 回にする）。見本はメインのチェックアウトの `.agents/scratch/fv-check/` に置く。Step 13 で測った描画の外で準備する大きさが整形表示の上限以上だったときは、1・3・4 の「整形中…」を経る場面は起きないので、その部分は省く。不合格の項目は、cycle の修正に戻して直す。

1. 画像やバッジの多い大きな README（描画の外で準備する大きさを超え、整形表示の上限より小さい）を開く → 「整形中…」のあと整形表示が出て、画像の名前を押すと画像が開く。準備の間もスクロールが引っかからない（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
2. ふつうの README と、図のある小さな README を開く・ソース表示から戻る → 「整形中…」がちらつかずに出る（図のある方は、ソース表示の間に図が変わってから戻ったときだけ一瞬出てよい。ソース表示での編集を PostMessage で送れなければ、ソース表示の間に外から書き換えて確かめる）（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
3. 1 の README を整形表示したまま、ターミナルで追記 → 前の整形表示が出たまま差し替わる。2 秒おきに追記し続けても、表示が新しい中身に進み、スクロールの位置が保たれる（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
4. 1 の README をソース表示で直して（送れなければ、ソース表示の間に外から書き換えて）整形表示に戻る → 「整形中…」のあと、直した中身で出る（直す前の中身は見えない）。「整形中…」の間にソース表示へ行って何もせず戻る → 済んでいればすぐ出る（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
5. 図の数が整形表示の上限ちょうどの Markdown を開く → 整形表示が出て、スクロールしても止まらず、どの図もノードの名前が全部出る（[描き方](../spec/file-viewer/mermaid.md#描き方)、[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)）
6. 図を押す → 収まる大きさのくっきりした絵で拡大の窓が開く。倍率のボタンで 3 倍以上に拡大してもくっきりしていて、ぼやけた絵が一瞬も見えない（[拡大表示](../spec/file-viewer/mermaid.md#拡大表示)）
7. テーマを切り替える（playground で `do app.theme`） → 本文・拡大の窓・`.mmd` の図がまとめて新しい色に替わり、新旧の色が混ざらず、「整形中…」にならない（[色](../spec/file-viewer/mermaid.md#色)）
8. 大きな `.mmd` と小さな `.mmd` を開く → 止まらずに図が出る（[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)）
9. 部品で描いていた図と SVG の図を並べた画像（Step 13）を見る → 大きさ・色・線・文字の位置と字体に違和感が無い（作業者が決める）（[描き方](../spec/file-viewer/mermaid.md#描き方)）
10. 整形表示の上限を超える Markdown を開く → ソース表示で、上限の値と今の大きさが出て、整形表示のボタンが無い。削って下回る（送れなければ外から書き換えて） → 帯が消えてボタンが出るが、表示はソースのまま。ボタンを押すと整形表示になる。自分でソース表示を選んだタブは、どう削っても勝手に整形表示にならない（[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)）
11. 上限を超える Markdown をツリーでシングルクリックしてプレビュータブに入れる → ソース表示で開く。再起動後も、上限で移したソース表示が利用者の選んだ表示として残っていない（再起動は作業者の許可を得て playground を閉じて起動し直す）（[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)）

## Verification map

| 仕様の節 | 示すステップ |
|---|---|
| [整形の準備](../spec/file-viewer/viewers.md#整形の準備)（描画の中か外か、結果が同じ、見え方、途中で変わったとき、失敗、SVG の書き出しの待ち） | Step 1（値）、Step 2・3（テスト）、Step 4（実機）、Step 6、Step 9（書き出しの待ちと失敗）、Step 13（値の測り直し）、受け入れ 1〜4 |
| [整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限) | Step 1（値）、Step 2（判定のテスト）、Step 3（切り替えのテスト）、Step 5（実機）、Step 6、Step 13（SVG の作りでの測り直し）、受け入れ 5・10・11 |
| [markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)（今の内容を表示する、の例外。プレビュータブでソース表示） | Step 3（テスト）、受け入れ 3・11 |
| [ローカル画像](../spec/file-viewer/viewers.md#ローカル画像) | Step 2（既存のテストが変わらない、区切った結果が同じ） |
| [描けない図](../spec/file-viewer/mermaid.md#描けない図)（図ごとの失敗、行番号） | Step 2（失敗した図だけが失敗になるテスト。既存の行番号のテストが変わらない） |
| [外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)・[下書き](../spec/file-viewer/editing.md#下書き) | Step 3（中身が変わったときのテスト）、Step 4（実機の追記） |
| [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)（整形の準備の知らせと「図を書き出せなかった」） | Step 4・5（P11 の持ち方。外部変更の知らせと並んで出る）、Step 9・10（「図を書き出せなかった」） |
| [描き方](../spec/file-viewer/mermaid.md#描き方) | Step 7（字体・比べる元）、Step 8（SVG のテスト）、Step 9（整形表示）、Step 13（並べた画像）、受け入れ 5・9 |
| [拡大表示](../spec/file-viewer/mermaid.md#拡大表示) | Step 11、Step 12（.mmd の倍率）、受け入れ 6 |
| [色](../spec/file-viewer/mermaid.md#色) | Step 8（色が入る）、Step 10（本文）、Step 11（拡大の窓）、Step 12（.mmd）、受け入れ 7 |
| [描けない図](../spec/file-viewer/mermaid.md#描けない図)（.mmd の 2 つの理由） | Step 12 |
| [Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル) | Step 12、受け入れ 8 |
| [image viewer](../spec/file-viewer/viewers.md#image-viewer)（キャッシュの消し方） | Step 9（タブを閉じたら消える、使わなくなったものを消す、無くなったら書き直す）、Step 11（窓が書いたもの） |
| [実機の確かめ](../spec/file-viewer/index.md#実機の確かめ) | Step 7（手順をガイドに）、Step 7〜13（その手順で確かめ、前後の記録を `guard-log.txt` に残す） |

## Left to the implementer

- 関数・ファイルの名前と分け方、lib の中の置き場所
- 帯の文言と並び順（[任せたこと](../spec/file-viewer/viewers.md#任せたこと)）
- 区切りに使う入出力の種類（P5 の範囲内）
- 画面の拡大率（DPI）の取り方の細部（[Mermaid 図の任せたこと](../spec/file-viewer/mermaid.md#任せたこと)。書き出しの大きさの式は P27。くっきり描ければよい）

## Stop conditions

- 実機の測定で、仕様の成功条件と食い違う事実が出たとき（例: 部品がふつうの README でも 1 秒以上固まる、描画の外の処理から描き直しを起こせない）
- 画面を使う確かめを、作業者の許しを得ずに始めることになるとき（P3。Step 1〜6）
- playground を、作業者の許しを得ずに起動することになるとき。playground の操作の前後で作業者の窓や前面が変わったとき（P16）
- Step 7 からの確かめで、作業者の app に mod を入れたり、作業者の窓を操作したりしないと進めないと分かったとき
- playground の `status` に `out of memory` が出る、表示に `Null"null"` が出る、playground が落ちる・描かなくなったとき（製品の不具合と取り違えず、止まって作業者に再起動の許可を求める。P16）
- app home の同梱 mod・`keys.json`・`settings.json`・`shared.json` を直接編集しないと進めないと分かったとき
- 作業者のタブ・space を閉じる、layout を切り替える、herdr-app を再起動する必要が出たとき

## Test command

`bun test`（`package.json` の `test`）。

## Out of scope

- [作らないもの](../spec/file-viewer/index.md#作らないもの) にあるもの
- 仕様に書き足す宿題として残っているもの（改行の上限の例外、CommonMark の一文、前の版の下書きの BOM、自動の読み直しでの「復元 / 破棄」、Mermaid の行番号のテスト）
- Windows ローカルの space と ssh の space での実機確認（[共通の前提](../spec/file-viewer/index.md#共通の前提)）
