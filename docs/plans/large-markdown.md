# 大きな Markdown の整形表示の実装計画

File viewer 仕様の「整形の準備」と「整形表示の上限」（2026-11-07 の改訂）を、今の `mods/file-viewer/` に入れる計画。実装ブランチは `large-markdown`。

## Goal

画像やバッジ・図の多い大きな Markdown を開いても整形表示が止まらず（描画の外で整形の準備をして「整形中…」を出す）、部品が描くのに重すぎる Markdown はソース表示で理由を出して開く状態にする。

## Specification

- [viewer](../spec/file-viewer/viewers.md) — [整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)（今の内容を表示する、プレビュータブで整形表示に戻す）、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)（画像を押せる名前にする処理そのもの）、[上限](../spec/file-viewer/viewers.md#上限)、[任せたこと](../spec/file-viewer/viewers.md#任せたこと)
- [編集・保存と外部変更](../spec/file-viewer/editing.md) — [外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)、[下書き](../spec/file-viewer/editing.md#下書き)
- [開き方とタブ](../spec/file-viewer/opening-and-tabs.md) — [プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)
- [Mermaid 図](../spec/file-viewer/mermaid.md) — [描けない図](../spec/file-viewer/mermaid.md#描けない図)（図ごとの失敗の出し方と行番号）
- [File viewer 仕様（入口）](../spec/file-viewer/index.md) — [共通の前提](../spec/file-viewer/index.md#共通の前提)、[作らないもの](../spec/file-viewer/index.md#作らないもの)
- 用語: [CONTEXT.md](../../CONTEXT.md)（整形の準備、プレビュータブ、外部変更）
- プラットフォームの事実と制約: [mod 開発ガイド](../guides/herdr-app-mod-development.md)（「開発ループ」「制約」。特に「描画の時間」「`matchAll`」「長い同期処理」「`check`」「`herdr-app shot`」）

## Approach and why

### 今の作り（読んで分かったこと）

- 整形表示は `mods/file-viewer/views/markdown.js` の `markdownBody` が描く。描画のたびに `partsOf` が、文書を ` ```mermaid ` の境目で分け（`splitMermaidBlocks`）、参照形式の定義を集め（`collectDefinitions`）、文章の部分ごとに画像を押せる名前にする（`rewriteImages`）。結果は、同じ中身なら `box.parts` に覚える。描画が打ち切られると覚えられないので、大きな文書では毎回やり直して止まり続ける。
- 図の解析と配置は `main.js` の `layoutOf` が描画の中でする。結果は `this.diagrams` に覚えるが、覚えた数が 64 を超えた状態で次を足すときに全部捨てる（65 個までは覚え、66 個目で捨てる）。図の線や箱の要素は、描画のたびに `views/mermaid.js` の `diagram` が組み立てる。
- 表示の切り替え（整形 / ソース）は、タブの記録（`registry.js` の `putRecord`）の `mode` に持つ（`"source"` か `null`）。プレビュータブの中身が入れ替わると `mode: null` になる。この記録が再起動後の復元にも使われる。
- タブの中の知らせは `main.js` の `notices()` が帯で並べる。外部変更の知らせ（`file.external`）とほかの知らせ（`file.notice`）は別に持っていて、重なりの判断は `lib/notices.js`。
- タブの中身は `this.file` に持つ。`load()`（開く・プレビュータブの入れ替え）は新しい `file` を作り、`reload()`（外部変更の読み直し）も読み直した内容で `this.file` を丸ごと入れ替える（引き継ぐのは `lib/reload.js` の `carryOver` の zoom と下書きだけ）。下書きの復元（`restoreDraft`）は今の `file` の Editor に入れる。
- タブを表示しているかは `visible()` が `this.me` で決めるが、`this.me` は `render()` の中でだけ取り直す。表示していないタブで `render()` が呼ばれるかは確かめていない。

### 作り方の全体

- **コマンドの呼び方と反映**: `herdr-app <サブコマンド>` は、ガイドの「開発ループ」の `$APP`（Windows 側の `herdr-app.exe`。PATH には無い）で呼ぶ。mod は `scripts/deploy.sh file-viewer` で app home に反映し、同じスクリプトが `herdr-app check` を通す。`mods/file-tree/` の `lib` は `mods/file-viewer/lib` へのシンボリックリンクなので、lib を変えたら `scripts/deploy.sh file-tree` も流す。app home 側を直接編集しない。
- **判断は lib、つなぎは main.js と views**。今の分け方を保つ。仕様の「確かめ方」が単体テストを指定している判断（区切りながらの準備、描画の外で準備する大きさの判定、見え方の決まり、10 秒の扱い、整形表示の上限で表示を選ぶ処理）は `mods/file-viewer/lib/` に置き、`herdr` / `gpui-kit` を import しない。lib は QuickJS で動く書き方に限る。描画の中や準備の 1 区間の中で何度も呼ぶ所で `String.prototype.matchAll` を使わない（ガイドの「`matchAll`」。lib/markdown.js の `matchesOf` を使う）。正規表現での `split` も、仕様上は同じく正規表現を複製するので、同じ所では避ける（ガイドには書いていない、この計画の推論）。
- **順番**: 実機の事実を測る（Step 1）→ 区切りながら準備する処理（Step 2）→ 見え方の決まり（Step 3）→ 画面へのつなぎ（Step 4）→ 整形表示の上限（Step 5）→ 通しの確認（Step 6）。Step 1 の (3)〜(5)（部品と図の重さ、差し替えでスクロールが保たれるか）で Step 2〜5 の作りと基準が変わるので最初に置く。(1)・(2)（描画の中で済む大きさ）は今の処理で測る仮の値で、Step 6 で新しい処理で測り直して定数を直す。Step 2・3 は lib だけで互いに独立している（順は 2 → 3 とする）。Step 4 が両方を使う。

### 仕様が決めていないことへの仮の答え

それぞれ、覆す条件（作業者がこう言えば変える）を添える。

- **P1 測るための mod**: Step 1 と Step 6 の測定は、使い捨ての mod（`fv-probe`）で行う。リポジトリに未追跡の `mods/fv-probe/` を作り（コミットしない）、`mod.json` を `{"place": "none", "title": "fv-probe"}` にして `main.js` より先に置く（`place` が無いと、app が今の layout に組み込むため）。file-viewer の部品は、`mods/file-tree/` と同じく `mods/fv-probe/lib` などを `../file-viewer/lib` へのシンボリックリンクにして使い（mod は自分のフォルダの外を import できない）、`scripts/deploy.sh fv-probe` で app home に反映する。見本の文書は、mod の中の JavaScript で作るか、mod のフォルダに置いた JS のモジュール（文字列を export する）から読む（`check` は非同期を動かさないので、ファイルを読む方法は使えない）。結果は `fs/promises` で app home 直下の `fv-probe-result.json` に書き、実装者が WSL から読む。`shared` には書かない（動いているアプリからはキーを消せないため）。終わったら、開いたタブを閉じ、app home の `mods/fv-probe/` と結果のファイル、リポジトリの `mods/fv-probe/` を消す（未追跡のファイルの削除なので、消せないときは一時の場所へ移す）。測る前と後で app home の `layouts/` の中身が同じことを確かめる。覆す条件: なし。
- **P2 interrupted になる大きさは `herdr-app check` で探す**: ガイドの「`check`」のとおり、`check` は初回描画が長いと `interrupted` で失敗する。そこで、見本の文書の整形の準備を初回描画の中でする `fv-probe` を、大きさを変えて `check` に通し、通る最大の大きさを探す（画面を使わずに済む）。実機の窓でも同じ大きさの前後で止まるかを、Step 1 の (6) で 1 回見て、食い違えば窓の結果を採る。覆す条件: なし。
- **P3 画面を使う確かめ**: 部品が固まる時間と、差し替えでスクロールが保たれるかは、キーを送って画面を撮らないと分からない。メインのチェックアウト（worktree ではない、リポジトリの元の作業ツリー）の `scripts/desktop/`（未追跡。WSL から PowerShell で画面を撮り、キーとクリックを送る道具。使い方と注意はその README）を使う。止まった時間を測るには、呼ぶたびに PowerShell を起動する今の道具では間隔が粗いので、1 つの PowerShell の中でキーを送ってから時刻付きで続けて撮る小さなスクリプトを `.agents/scratch/` に作り、撮る間隔を 100 ms 以下にする。画面とマウスを使うので、**始める前に止まり、作業者に PC から手を離してもらえるかを確かめる**（作業者が今使っている機械への外からの操作なので）。実機の窓で重い文書を開く確かめ（Step 1 の (6)、Step 4〜6 の重い見本）と、作業者の表示を切り替える `tab.new` も、同じく始める前に確かめる。`tab.new` で開いたあとは、確かめが終わったら作業者がもともと見ていたタブに `tab.select` で戻す。重さを測るときは小さい大きさから上げていき、初めて 1 秒以上止まったところで打ち切る。止まったまま 10 秒戻らないときや app が落ちたときは、そこで止めて作業者に返す。herdr-app は再起動しない。送る前に毎回 `need:herdr-app` を付け、送り先のペインにフォーカスがあることを撮った画像で確かめる（実装者自身が herdr-app の端末で動いているので、フォーカスがそこに残っていると自分の入力欄に入る）。止まった時間は、キーを送ってから画面が変わるまでを、続けて撮った画像の差で測る（仕様の「整形表示の上限」）。止まった時間の測定には `herdr-app shot` を使わない（描き直されない間は前の画面を返すため。止まっていない画面を 1 枚見るだけの確かめには使ってよい）。メインのチェックアウトに `scripts/desktop/` が無いときは、止めて返す（未追跡の道具なので、無くなっていることがある）。覆す条件: 作業者が、画面を使う確かめは受け入れでまとめて自分でやると言ったとき。そのときは、整形表示の上限を仮の値（バイト数 256 KiB、図の数 100）にしてガイドに「仮」と書き、Step 1 の (5) は「未確認」、Step 6 の画面の確かめは受け入れに回す。
- **P4 区切りながらの準備の作り**: 準備を、少しずつ進められる単位の並びにする。単位は、かたまり（`blocksOf` のかたまり）ごとの定義の収集、文章の部分ごとのかたまりの画像の処理、図 1 個の解析と配置（定義の収集も文書全体で 1 単位にしない）。lib に「準備を始める（中身を受け取る）」「時間の予算まで進める（今の時刻を返す関数を受け取る）」「終わったか・結果」を持つものを置く。かたまりをまたいで続く状態（`<picture>` の中か）も持ち越すが、今の作り（図の部分ごとに `rewriteImages` を呼ぶ）と同じく、図の境目で初めに戻す。描画の中で済ませる文書は、同じものを予算無しで最後まで進めて使う（一度に準備した結果と区切った結果が同じだと、テストで比べられる）。予算無しの結果は、今の `collectDefinitions` + `splitMermaidBlocks` + 部分ごとの `rewriteImages` と同じにする（外から見た振る舞いを変えない）。準備の結果は「文章の部分の書き換えた Markdown と、図ごとの配置（か失敗）」の並びで、`markdownBody` はこの結果から描く（描画の中で `layoutOf` を呼ばない）。図の配置は文書ごとに全部覚えておくことになり、`this.diagrams` の 64 個の上限は整形表示では使わない（`.mmd` と図の拡大の窓はこれまでどおり `layoutOf`）。覆す条件: なし。
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

## Scope of change

- `mods/file-viewer/lib/markdown.js`（区切りながらの準備に合わせた分け方）、新しい lib のファイル（区切りながらの準備、見え方の決まり、整形表示の上限の判定。名前は実装者に任せる）
- `mods/file-viewer/views/markdown.js`（準備の結果から描く、「整形中…」、代わりの整形表示）
- `mods/file-viewer/main.js`（準備の始め方と区切り、見え方、知らせ、整形表示の上限、ソース表示のボタン）
- `tests/`（既存の `markdown-links.test.js` に足すか、新しいファイル）
- `docs/guides/herdr-app-mod-development.md`（Step 1 と実装で測った値と事実）
- `docs/README.md`（この計画への 1 行。計画を消すときに一緒に消す）
- 作業者の app home の `mods/file-viewer/`・`mods/file-tree/`（反映先）、測る間だけの app home の `mods/fv-probe/`・`fv-probe-result.json` と、リポジトリの未追跡の `mods/fv-probe/`（P1）
- メインのチェックアウトの `.agents/scratch/`（ignore 済み。確認用リポジトリ `fv-check/` に見本の Markdown を足す。測るためのスクリプト）

app home のそれ以外のファイル（同梱 mod、同梱 layout、`keys.json`、`settings.json`、`shared.json`）は直接編集しない。

## Step order and prerequisites

1 → 2 → 3 → 4 → 5 → 6。各ステップの「Shown by」が通らなければ次に進まない。

実機での確認は作業者の herdr-app（Windows）と WSL の space で行う（[共通の前提](../spec/file-viewer/index.md#共通の前提)）。作業者は使用中なので、作業者のタブ・ペイン・space を閉じない。layout は切り替えない。herdr-app は再起動しない（再起動後の振る舞いは単体テストと受け入れ 7 で確かめる）。実装者が開いたタブは、確かめが終わったら閉じ、作業者がもともと見ていたタブに戻す。画面を使う確かめ、重い文書を実機の窓で開く確かめ、表示を切り替える `tab.new` は、P3 のとおり始める前に作業者に確かめる。

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

## 受け入れの操作確認

cycle の最後の受け入れで、作業者が WSL の space（メインのチェックアウトの `.agents/scratch/fv-check/`）で行う。Step 1 で整形表示の上限が描画の外で準備する大きさ以下だったときは、1・3・4 の「整形中…」を経る場面は起きないので、その項目は省く（Step 4 の止まる条件のとおり）。作業者が許せば、実装者が P3 の道具で代わりに行ってよい。不合格の項目は cycle の修正に戻して直す。

1. 画像やバッジの多い大きな README（描画の外で準備する大きさを超え、整形表示の上限より小さい）を開く → 「整形中…」のあと整形表示が出て、画像の名前を押すと画像が開く。準備の間もスクロールが引っかからない（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
2. ふつうの README を開く・ソース表示から戻る → 「整形中…」がちらつかずに出る（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
3. 1 の README を整形表示したまま、ターミナルで追記 → 前の整形表示が出たまま差し替わる。2 秒おきに追記し続けても、表示が新しい中身に進む。差し替えでスクロールの位置がどうなるか（Step 1 の事実のとおりか）（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
4. 1 の README をソース表示で直して整形表示に戻る → 「整形中…」のあと、直した中身で出る（直す前の中身は見えない）。「整形中…」の間にソース表示へ行って何もせず戻る → 済んでいればすぐ出る（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)）
5. 図が 100 個ほどある Markdown を開く → 整形表示が出て、図を押すと拡大の窓が開く（[整形の準備](../spec/file-viewer/viewers.md#整形の準備)、[Mermaid 図](../spec/file-viewer/mermaid.md)）
6. 整形表示の上限を超える Markdown を開く → ソース表示で、上限の値と今の大きさが出て、整形表示のボタンが無い。ソース表示で削って上限を下回る → 帯が消えてボタンが出るが、表示はソースのまま。ボタンを押すと整形表示になる。自分でソース表示を選んだタブは、どう削っても勝手に整形表示にならない（[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)）
7. 上限を超える Markdown をツリーでシングルクリックしてプレビュータブに入れる → ソース表示で開く。再起動後も、上限で移したソース表示が利用者の選んだ表示として残っていない（[整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)）

## Verification map

| 仕様の節 | 示すステップ |
|---|---|
| [整形の準備](../spec/file-viewer/viewers.md#整形の準備)（描画の中か外か、結果が同じ、見え方、途中で変わったとき、失敗） | Step 1（値）、Step 2・3（テスト）、Step 4（実機）、Step 6、受け入れ 1〜5 |
| [整形表示の上限](../spec/file-viewer/viewers.md#整形表示の上限) | Step 1（値）、Step 2（判定のテスト）、Step 3（切り替えのテスト）、Step 5（実機）、Step 6、受け入れ 6・7 |
| [markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)（今の内容を表示する、の例外。プレビュータブでソース表示） | Step 3（テスト）、受け入れ 3・7 |
| [ローカル画像](../spec/file-viewer/viewers.md#ローカル画像) | Step 2（既存のテストが変わらない、区切った結果が同じ） |
| [描けない図](../spec/file-viewer/mermaid.md#描けない図)（図ごとの失敗、行番号） | Step 2（失敗した図だけが失敗になるテスト。既存の行番号のテストが変わらない） |
| [外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)・[下書き](../spec/file-viewer/editing.md#下書き) | Step 3（中身が変わったときのテスト）、Step 4（実機の追記） |
| [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)（新しい 3 つの知らせ） | Step 4・5（P11 の持ち方。外部変更の知らせと並んで出る） |
| [作らないもの](../spec/file-viewer/index.md#作らないもの)（大きな `.mmd`） | 足すものが無い（`.mmd` は今の `mermaidFile` のまま） |

## Left to the implementer

- 関数・ファイルの名前と分け方、lib の中の置き場所
- 帯の文言と並び順（[任せたこと](../spec/file-viewer/viewers.md#任せたこと)）
- 区切りに使う入出力の種類（P5 の範囲内）

## Stop conditions

- 実機の測定で、仕様の成功条件と食い違う事実が出たとき（例: 部品がふつうの README でも 1 秒以上固まる、描画の外の処理から描き直しを起こせない）
- 画面を使う確かめを、作業者の許しを得ずに始めることになるとき（P3）
- app home の同梱 mod・`keys.json`・`settings.json`・`shared.json` を直接編集しないと進めないと分かったとき
- 作業者のタブ・space を閉じる、layout を切り替える、herdr-app を再起動する必要が出たとき

## Test command

`bun test`（`package.json` の `test`）。

## Out of scope

- [作らないもの](../spec/file-viewer/index.md#作らないもの) にあるもの（大きな `.mmd` を描画の外で扱うこと、ほか）
- 仕様に書き足す宿題として残っているもの（改行の上限の例外、CommonMark の一文、前の版の下書きの BOM、自動の読み直しでの「復元 / 破棄」、Mermaid の行番号のテスト）
- Windows ローカルの space と ssh の space での実機確認（[共通の前提](../spec/file-viewer/index.md#共通の前提)）
