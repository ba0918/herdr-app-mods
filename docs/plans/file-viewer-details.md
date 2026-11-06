# File viewer 仕様の細部の実装計画

File viewer 仕様の 2026-11-07 の改訂（改行・BOM・文字コード・知らせの重なり・Markdown の画像とフォルダへのリンク）を、今の `mods/file-viewer/` に入れる計画。実装ブランチは `file-viewer-details`。

## Goal

改訂した仕様の各節（下の Specification）が、今の File viewer の振る舞いになっている状態にする。今の実装はこれらの節より前に作られているので、主に既存の処理を直す。

## Specification

- [編集・保存と外部変更](../spec/file-viewer/editing.md) — [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)、[ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)、[改行](../spec/file-viewer/editing.md#改行)、[BOM](../spec/file-viewer/editing.md#bom)、[UTF-8 でないファイル](../spec/file-viewer/editing.md#utf-8-でないファイル)、[下書き](../spec/file-viewer/editing.md#下書き)、[任せたこと](../spec/file-viewer/editing.md#任せたこと)
- [viewer](../spec/file-viewer/viewers.md) — [リンク](../spec/file-viewer/viewers.md#リンク)、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)、[任せたこと](../spec/file-viewer/viewers.md#任せたこと)
- [File viewer 仕様（入口）](../spec/file-viewer/index.md) — [共通の前提](../spec/file-viewer/index.md#共通の前提)、[作らないもの](../spec/file-viewer/index.md#作らないもの)
- [Mermaid 図](../spec/file-viewer/mermaid.md) — [描けない図](../spec/file-viewer/mermaid.md#描けない図)（行番号の約束）
- 用語: [CONTEXT.md](../../CONTEXT.md)
- プラットフォームの事実と制約: [mod 開発ガイド](../guides/herdr-app-mod-development.md)（「開発ループ」「制約」）

## Approach and why

### 作り方の全体

- **コマンドの呼び方と反映**: `herdr-app <サブコマンド>` は、ガイドの「開発ループ」の `$APP`（Windows 側の `herdr-app.exe`。PATH には無い）で呼ぶ。mod は `scripts/deploy.sh file-viewer` で app home に反映し、同じスクリプトが `herdr-app check` を通す。`mods/file-tree/` の `lib` と `registry.js` は `mods/file-viewer/` へのシンボリックリンクなので、lib を変えたら `scripts/deploy.sh file-tree` も流す。app home 側を直接編集しない。
- **判断は lib、入出力は io.js、つなぎは main.js**。今の分け方を保つ。仕様の「確かめ方」が単体テストを指定している判断（改行と BOM の書き戻し、UTF-8 のバイト列の判定、外部変更の知らせを出すか、Markdown の書き換え）は `mods/file-viewer/lib/` に置き、`herdr` / `gpui-kit` を import しない。lib は QuickJS で動く書き方に限る（`TextEncoder` が無い、`Buffer` の base64 が壊れている。ガイドの「制約」）。
- **実機での確かめ方を 2 つに分ける**。実装者は GUI をクリック・入力できない。CLI から起こせること（`herdr-app do tab.new` で viewer のタブを開く、WSL のターミナルからのファイルの書き換え・削除・文字コードの変更、`herdr-app ls` / `status` / `shot`）は各ステップで実装者が確かめる。入力・クリック・ctrl-s が要る確認は [受け入れの操作確認](#受け入れの操作確認) に集め、cycle の最後の受け入れで作業者が行う。
- **順番**: 実機の事実の確認（Step 1）→ 改行と BOM（Step 2）→ UTF-8 の判定（Step 3）→ 知らせの重なり（Step 4）→ フォルダへのリンク（Step 5）→ Markdown の画像（Step 6）→ 通しの確認（Step 7）。Step 1 の結果で Step 2 の BOM の取り方と Step 6 の http(s) の画像・HTML の扱いが変わるので最初に置く。Step 2〜5 は互いに独立しているが、同じ `main.js` を触るので順に行う。

### 仕様が決めていないことへの仮の答え

それぞれ、覆す条件（作業者がこう言えば変える）を添える。

- **P1 確かめ用の mod の結果の受け取り方**: Step 1 の確かめは、使い捨ての mod（`fv-probe`）を app home の `mods/` に置き、`herdr-app do tab.new` で開いて行う。結果は `shared` ではなく、`fs/promises` で app home 直下の `fv-probe-result.json` に書き、実装者が WSL から読む。`shared` のキーは動いているアプリからは消せず（値を null にしてもキーが残る）、前回の確かめの後始末にアプリの再起動が要ったため。確かめが終わったら、開いたタブを閉じ、`mods/fv-probe/` と `fv-probe-result.json` を消す。覆す条件: なし。
- **P2 実機確認用のファイルと場所**: 書き換え・削除・文字コードの変更をするファイルは、リポジトリの `.agents/scratch/fv-check/`（ignore 済み）に作った使い捨ての git リポジトリに置く。viewer のタブは、作業者が今使っている space に `tab.new` で開き、確かめが終わったら閉じる。新しい space は作らない（前回、確認用に作った space が残った）。覆す条件: 確認用の space を作ってよいと言われたとき。
- **P3 行の対応の取り方**（[任せたこと](../spec/file-viewer/editing.md#任せたこと)で実装に任せられた部分）: 読んだときの内容と編集後の内容を、改行を除いた行の並びとして比べ、行の差分（最長共通部分列。共通の先頭と末尾を先に外し、残りを Myers の差分などで比べる）で「編集していない行」を決める。差分で一致した行は元の改行、それ以外の行と新しく生まれた改行は多いほう（同数・空なら LF）。比べるときは各行の末尾の `\r` を外す（Editor が CRLF をそのまま返すため。ガイドの「制約」の `EditorState`）。覆す条件: 1 MiB のテキストの保存で目に見えて待たされるとき（Step 2 の停止条件）。
- **P4 BOM の取り方**: 読んだ内容の先頭が U+FEFF なら BOM ありとし、そのタブに BOM の有無を記録する。BOM はタブの「読んだときの内容」（今の `file.text`）からも Editor に渡す内容からも外し、どちらも BOM 抜きの本文で持つ（改行の書き戻しで 1 行目が「編集した行」に見えないようにするため）。保存では、BOM 抜きの本文で改行を書き戻してから、記録した有無で先頭に BOM を付けて書く。保存後の「読んだときの内容」も BOM 抜きで持つ。
  - Step 1 で読み込みの経路が BOM を落とすと分かった場合: WSL などの machine は、読み込みのシェルスクリプトの中で先頭 3 バイトも出して有無を決める（`head -c 3`）。このコンピュータの `readTextFile` はコマンドではないので、別に PowerShell で先頭 3 バイトを読む。
  - このコンピュータの基準（今は `readTextFile` で読んだ文字列のハッシュ。io.js の `readText`・`checkChanged`・`writeText`）は、いつも `readTextFile` が返す形の文字列でハッシュする。保存後の基準も、書いた文字列ではなく `readTextFile` が返す形（BOM を落とす経路なら BOM を外した形）でハッシュして、保存の直後の 2 秒ごとの確認が「変わった」にならないようにする。
  - 下書きには BOM の有無も記録する。ファイルが無いときに下書きを復元したタブ（読んだときの内容が無い）は、下書きに記録した有無を使う。
  覆す条件: なし。
- **P5 UTF-8 のバイト列の取り方**: 読んだ内容に U+FFFD があるときだけ、ファイルを base64 で運び（WSL などの machine は `base64 -w0`、このコンピュータは PowerShell の `[Convert]::ToBase64String`。画像の運搬と同じ方式）、lib の純 JS の判定で UTF-8 として正しいかを決める。コマンドの失敗・base64 の読み違いは「確かめられなかった」として読み取り専用にする。テキストの上限 1 MiB は base64 で約 1.4 MB で、`exec` の出力の上限 8 MiB に収まる。覆す条件: なし。
- **P6 HTML のかたまりの見分け方**: CommonMark の HTML ブロックを簡略化して、「空行の次（または文書の先頭）で、行頭の空白 3 つまでのあとに `<` とタグ名（または `<!--`）で始まる行から、次の空行まで」を HTML のかたまりとする。その中の `<img>` は Markdown のリンクに置き換えても押せる形にならない。覆す条件: よく使う README の書き方で、この見分け方が外れる例が見つかったとき。
- **P7 HTML の `<a>` を押せる形と見なす条件**: 仕様は `<a>` を押したことが mod に伝わるかを実装の最初に確かめるよう求めているが、実装者はクリックできない。そこで Step 1 で、確かめ用の mod のタブに、段落の中と HTML のかたまりの中の `<a href="fv-image:probe-a">` を出し、作業者に 1 回ずつ押してもらう（この計画で作業者の手を借りるのはここだけ）。mod は `on_link_click` で受けた URL を結果のファイルに書く。段落の中の `<img>` は、今のインライン形式と同じ Markdown のリンクに置き換えるので、この結果に関係なく押せる。この結果で変わるのは、HTML のかたまりの中の `<img>`（届けば `<a href="fv-image:...">名前</a>`、届かなければ押せない文字「画像: 名前（パス）」）と、HTML の `<a href>` に包まれた `<img>`（届けば外側のリンク先へ、届かなければ押せない文字。[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)の最後の文）。作業者がすぐに押せないときは、届かないものとして進め、受け入れの 7 で確かめ直す。覆す条件: 作業者が、途中で手を借りずに受け入れでまとめて確かめたいと言ったとき。
- **P8 http(s) の画像を部品が描けるかの判定**: Step 1 で、Markdown の `![x](https://...)` と `<img src="https://...">` をそれぞれ整形表示に出し、`herdr-app shot` で画像が描かれたかを見る。描かれた書き方は部品に任せ、描かれなかった書き方だけ名前に置き換える。ネットワークの都合で描かれない場合と区別するため、同じ URL を `curl` で取れることも確かめる。覆す条件: なし。
- **P9 参照の定義の集め方**: 参照形式の定義（`[id]: path`）は、文書全体（コードブロック・インラインコード・HTML のコメントの外）から集める。今の整形表示は ` ```mermaid ` の境目で文書を分けて部分ごとに書き換えるので、分ける前に集めた定義を各部分の書き換えに渡す。定義の行そのものは消さない。覆す条件: なし。
- **P10 外部変更の知らせの状態**: 外部変更の知らせは、ほかの知らせ（保存前の確認、作り直す確認、保存の失敗、下書きの後の変化）と別に持つ。どの知らせが出ていれば外部変更の知らせを出す・出さない・置き換えるかは、lib の 1 つの関数で決め、外部変更の知らせを出す箇所（今は 2 秒ごとの確認 `poll()` と、`reload()` の「読み込みの間に打ち込まれた」の分かれ道の 2 か所）はどちらもこの関数を通す。「下書きの後にディスクが変わっている」を出したときは、そのときのディスクの基準を知らせ済みとして記録し、その基準から変わったときだけ外部変更として知らせる。下書きを復元してから、復元のあとのディスクの確認（今の `restoreDraft` の `checkChanged`）が返るまでは、外部変更の知らせを出さない（返る前に 2 秒ごとの確認が走ると、同じ変化を 2 回知らせるため）。覆す条件: なし。
- **P11 読み直したらファイルが無かったとき**: 選択を待つ知らせの「ディスクの内容で読み直す」を選んだときや、外部変更で読み直したときにファイルが無ければ、中身の無いタブに置き換えず（今の `reload()` は置き換え、編集していたなら下書きも消す）、表示していた中身と未保存の編集を残して「ファイルが無くなった」にする（[ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)）。下書きも消さない。覆す条件: なし。
- **P12 http(s) の画像を名前にするときの行き先**: 名前のリンクの行き先は http(s) の URL そのもの（`fv-image:` を付けない）。今の `resolveLink` は `http(s)://` を先に見てブラウザ行きにするので、そのまま外へ開く。覆す条件: なし。

## Scope of change

- `mods/file-viewer/lib/save.js`（改行・BOM・UTF-8 の判定）、`mods/file-viewer/lib/markdown.js`（画像の書き換え）、新しい lib のファイル（知らせの判断。名前は実装者に任せる）
- `mods/file-viewer/io.js`（BOM の先頭バイト、UTF-8 の確かめ用のバイト列、パスがファイルかフォルダか）
- `mods/file-viewer/main.js`（読み込み・保存・知らせ・リンク）、`mods/file-viewer/views/markdown.js`（定義の受け渡し）
- `tests/`（既存の `save.test.js`・`markdown-links.test.js` に足すか、新しいファイル）
- `docs/guides/herdr-app-mod-development.md`（Step 1 と実装で分かった事実）
- `docs/README.md`（この計画への 1 行。計画を消すときに一緒に消す）
- 作業者の app home の `mods/file-viewer/`・`mods/file-tree/`（反映先）、確かめの間だけの `mods/fv-probe/`・`fv-probe-result.json`

app home のそれ以外のファイル（同梱 mod、同梱 layout、`keys.json`、`settings.json`、`shared.json`）は直接編集しない。viewer のタブを開くと、viewer が自分の記録を `shared` の `file-viewer:tabs` に書くが、これは mod の普段の動きなので構わない。確かめ用の mod は `shared` に書かない（P1）。

## Step order and prerequisites

1 → 2 → 3 → 4 → 5 → 6 → 7。各ステップの「Shown by」が通らなければ次に進まない。

実機での確認は作業者の herdr-app（Windows）と WSL の space で行う（[共通の前提](../spec/file-viewer/index.md#共通の前提)）。作業者は使用中なので、作業者のタブ・ペイン・space を閉じない。layout は切り替えない（今の作業者の layout が `main-viewer` でなければ、`tab.new` で開いた viewer のタブで確かめる）。

## Step 1 — 実機の事実を確かめる

Purpose: 後のステップの作り方を決める部品と読み込みの事実を、実機で確かめてガイドに書く。Specification: [BOM](../spec/file-viewer/editing.md#bom)、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)。
Prerequisites: herdr-app が起動していて、WSL の space があること。(5) のために作業者に 1 度声をかける（P7）。
May change: `.agents/scratch/`、`docs/guides/herdr-app-mod-development.md`、確かめの間だけ app home の `mods/fv-probe/` と `fv-probe-result.json`。
Done when: 次の 6 つの結果がガイドの「制約」の表にある（`TextView.markdown` の行、`exec` / `readTextFile` の行への追記か新しい行）。(1) WSL の machine で `cat` の出力を `exec` で受けたとき、先頭の BOM が U+FEFF として残るか。(2) このコンピュータの `readTextFile` で BOM が残るか。(3) 整形表示で、Markdown の http(s) 画像と `<img src="https://...">` が描かれるか。(4) 整形表示で、段落の中と HTML のかたまりの中の `<a href>` と `<img>`（ローカル）がどう描かれるか（リンクの見た目か、文字か、消えるか）。(5) 段落の中と HTML のかたまりの中の `<a>` を押したことが mod に届くか（P7。作業者に押してもらう）。(6) `fs/promises` の `writeFile` で先頭が U+FEFF の文字列を書くと、ファイルの先頭が `EF BB BF` になるか（WSL から `od` で見る）。確かめの後、`mods/fv-probe/`、`fv-probe-result.json`、(2) の見本のファイル、開いたタブが残っていない。
Shown by: artifact — `docs/guides/herdr-app-mod-development.md` の追記。あわせて `herdr-app ls` に `fv-probe` のタブが無く、app home（`scripts/deploy.sh` と同じ求め方。`HERDR_APP_HOME` があればそちら）の `mods/` に `fv-probe` が無く、app home 直下に結果のファイルと (2) の見本のファイルが無いこと。
Left to the implementer: 確かめ用の mod の書き方、見本の Markdown の中身。
Stop and hand back if: `tab.new` で `fv-probe` が開けないとき（ガイドの「制約」の「mod の追加」の再試行の後も）。(2) の見本のファイルは、確かめ用の mod 自身が `fs/promises` の `writeFile` で app home の下に書く（先頭が U+FEFF の文字列を書けば UTF-8 の BOM になる見込み。なるかは (6) で確かめる）。それでも置けないときは、このコンピュータの経路は仕様の確認の対象外なので、(2) だけ「未確認」とガイドに書いて進めてよい（止めない）。

## Step 2 — 改行と BOM の書き戻し

Purpose: 保存する内容を、行ごとの改行・末尾の改行・BOM の規則で作る。Specification: [改行](../spec/file-viewer/editing.md#改行)、[BOM](../spec/file-viewer/editing.md#bom)、[任せたこと](../spec/file-viewer/editing.md#任せたこと)。
Prerequisites: Step 1。
May change: `mods/file-viewer/lib/save.js`、`mods/file-viewer/io.js`、`mods/file-viewer/main.js`、`mods/file-viewer/lib/draft-store.js`（下書きの BOM の有無）、`tests/`、`docs/guides/herdr-app-mod-development.md`（測った時間）、測る間だけ app home の `mods/fv-probe/` と結果のファイル（P1 と同じ後始末）。
Done when: 下のテストが通り、`main.js` の保存がこの処理で内容を作り、読み込み（`read()` と、SVG のソースを読む `readImage()`）で BOM を外して記録している（P4）。下書きに BOM の有無が記録される。確かめ用の mod（Step 1 と同じ作り方）で、QuickJS 上で約 370 KB と 1 MiB のテキストに 1 行の書き換えを入れて保存する内容を作る時間を測り、ガイドの「制約」に書いてある。今の `main.js` の「Editor が改行を揃えることがある」という前提のコメントを、Step 1 とガイドの事実に合わせて直してある。
Shown by: test — RED → GREEN → REFACTOR で `bun test`（今の `preserveLineEndings` のテストのうち、新しい規則と食い違うもの〔末尾の改行を付け直す・外す〕は、新しい規則のテストに置き換える）:
- 混ざったファイル（CRLF 8 行・LF 2 行）で CRLF の 1 行目を書き換えると、LF の 2 行は LF のまま、1 行目は CRLF
- LF が多いファイルに行を足すと、その行は LF。CRLF が多いファイルなら CRLF。同数なら LF
- 行を消しても、残った行の改行は元のまま
- 編集後の内容の行末が `\r\n` で返っても `\n` で返っても、同じ結果になる
- 末尾に改行の無いファイルの最後に改行を付けると、多いほうの改行で付く。末尾の改行を消すと消える。最終行を書き換えても、末尾の改行の有無は変わらない
- 空のファイルに `a⏎b⏎` と書くと `a\nb\n`
- BOM 付きで読んだ内容は、Editor に渡す内容から BOM が外れ、書き戻す内容の先頭に BOM が付く。BOM 無しなら付かない
- BOM 付きで改行の混ざったファイル（1 行目が LF、CRLF が多い）で 2 行目だけを書き換えると、1 行目は LF のまま
Left to the implementer: 差分の取り方の細部（P3 の範囲内）、関数の分け方と名前。
Stop and hand back if: QuickJS 上の測定で、1 MiB のテキストの保存する内容を作るのに 1 秒を超えるとき（P3 の覆す条件）。

## Step 3 — UTF-8 のバイト列の判定

Purpose: U+FFFD を文字として含む正しい UTF-8 のファイルを編集できるようにする。Specification: [UTF-8 でないファイル](../spec/file-viewer/editing.md#utf-8-でないファイル)、[ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)。
Prerequisites: Step 2。
May change: `mods/file-viewer/lib/save.js`（または新しい lib のファイル）、`mods/file-viewer/io.js`、`mods/file-viewer/main.js`、`tests/`。
Done when: 下のテストが通り、読み込み（開いたとき・外部変更で読み直したとき。`read()` と、SVG のソースを読む `readImage()` の両方）で、U+FFFD があるときだけ P5 のバイト列の判定が走り、その結果で読み取り専用が決まる。読み取り専用のタブで保存も作り直しも起きない（今の `save()` の判定を保つ）。実機の確認（下）が通る。
Shown by: test — RED → GREEN → REFACTOR で `bun test`:
- 正しい UTF-8 のバイト列（ASCII、日本語、4 バイトの絵文字）は正しい
- U+FFFD を表す正しい列 `EF BF BD` を含むバイト列は正しい
- 不正な列（`FF`、`C0 80` のような冗長な表現、サロゲートの範囲 `ED A0 80`）と、途中で切れた列（`E3 81`）は正しくない
そのうえで `scripts/deploy.sh file-viewer` と `scripts/deploy.sh file-tree` で反映し（どちらも `check passed`）、実機（WSL の space、P2 の確認用リポジトリ）で: U+FFFD の文字を含む UTF-8 のファイルを `tab.new` で開き、`herdr-app shot` に読み取り専用の知らせが出ていない。Shift_JIS のファイル（`iconv -t SHIFT_JIS` で作る）を開くと知らせが出る。そのファイルを表示中に `iconv -f SHIFT_JIS -t UTF-8` で書き直すと、2 秒ほどで知らせが消える。
Left to the implementer: 判定の関数の置き場所と名前。
Stop and hand back if: `exec` の出力の base64 が、1 MiB 近いファイルで読み違える（判定が毎回「確かめられなかった」になる）とき。

## Step 4 — 知らせが重なったときの外部変更

Purpose: 外部変更の知らせを、ほかの知らせとの重なりの規則どおりに出す。Specification: [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[下書き](../spec/file-viewer/editing.md#下書き)、[ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)。
Prerequisites: Step 3。
May change: 新しい lib のファイル、`mods/file-viewer/main.js`、`tests/`。
Done when: 下のテストが通り、`main.js` の 2 秒ごとの確認（`poll()`）・`reload()` の読み込みの間に打ち込まれた分かれ道・保存・答え・下書きの復元がこの判断を使っている（P10）。読み直してファイルが無かったときは P11 のとおり中身を残す。外部変更の知らせと「保存に失敗した」「下書きの後にディスクが変わっている」「復元 / 破棄」が同時に画面に出せる。「作り直す」を選んだときにファイルが戻っていたら 3 択に移る、今の振る舞いを保っている。
Shown by: test — RED → GREEN → REFACTOR で `bun test`。判断の関数に、編集中か、出ている知らせの種類、ディスクの今の基準、知らせ済みの基準を渡し、出す / 出さない / 置き換えるを比べる:
- 保存前の確認の 3 択か作り直す確認が出ていれば出さない。それが閉じたあと、ディスクが基準と違うままなら出す
- 外部変更の知らせが出ている間にディスクがまた変わっても、知らせは 1 つ（基準だけ新しくなる）
- 外部変更の知らせが出ている間に保存前の確認が開くと、外部変更の知らせは消える
- 保存の失敗、「下書きの後にディスクが変わっている」、「復元 / 破棄」が出ていても出す
- 「下書きの後にディスクが変わっている」を出したときのディスクの基準のままなら出さない。そこから変われば出す
- 「自分の編集を続ける」を選んだ変化は出さない（今の振る舞い）
- 未編集のタブでは出さない（自動で読み直す側に回る）
- 下書きの復元のあとのディスクの確認が返るまでは出さない
- 読み直した結果ファイルが無ければ、タブの中身を置き換えない（P11 の判断を lib に置く場合）
Left to the implementer: 知らせの状態の持ち方（P10 の範囲内）、関数の名前と置き場所、帯の並び順。
Stop and hand back if: none。

## Step 5 — フォルダへのリンク

Purpose: フォルダを指すリンクを押したとき、無いときとは別の知らせを出す。Specification: [リンク](../spec/file-viewer/viewers.md#リンク)、[任せたこと](../spec/file-viewer/viewers.md#任せたこと)。
Prerequisites: Step 4。
May change: `mods/file-viewer/io.js`、`mods/file-viewer/main.js`。
Done when: `io.js` に、パスがファイルか・フォルダか・無いかを返す処理があり（WSL などの machine は `sh` の `-f` / `-d`、このコンピュータは PowerShell の `Test-Path -PathType`）、`followLink` がフォルダのとき「リンク先はフォルダなので開けない」の知らせ（文言の細部は任せられている）を出し、無いときは今の知らせのまま。
Shown by: check — 順に `bun test`（既存のテストが通る）、`scripts/deploy.sh file-viewer`（`check passed`）、`scripts/deploy.sh file-tree`（`check passed`）。押したときの振る舞いは [受け入れの操作確認](#受け入れの操作確認) の 6。
Left to the implementer: 知らせの文言、関数の名前。
Stop and hand back if: none。

## Step 6 — Markdown の画像の書き換え

Purpose: 参照形式と `<img>` のローカル画像、リンクに包まれた画像、http(s) の画像を、仕様どおりに整形表示に出す。Specification: [ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)、[リンク](../spec/file-viewer/viewers.md#リンク)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)、[作らないもの](../spec/file-viewer/index.md#作らないもの)。
Prerequisites: Step 1（P7・P8 の結果）、Step 5。
May change: `mods/file-viewer/lib/markdown.js`、`mods/file-viewer/views/markdown.js`、`mods/file-viewer/main.js`（`followLink`）、`tests/`。
Done when: 下のテストが通り、整形表示が文書全体から集めた定義を使って各部分を書き換えている（P9）。` ```mermaid ` の境目で分けてから部分ごとに書き換える今の順（`views/markdown.js`）を保ち、Mermaid の行番号を元の Markdown で数え続けている。実機の確認（下）が通る。
Shown by: test — RED → GREEN → REFACTOR で `bun test`（`rewriteLocalImages` か、それを置き換える関数）:
- `![図][arch]`・`![arch][]`・`![arch]` と定義 `[arch]: img/a.png` が、インライン形式と同じ押せる名前になり、定義の行は残る。同じ定義を使う `[ダウンロード][arch]` は書き換わらない
- 定義が ` ```mermaid ` のブロックより後ろにあっても、前の部分の参照形式が解決される
- `<img src="img/a.png" alt="図">` は「図」、`alt` が無ければ `a.png`
- 段落の中の `<img>` は押せる名前、HTML のかたまり（P6）の中の `<img>` は P7 の結果のとおり（押せる `<a>` か、「画像: 図（img/a.png）」の文字）
- `[![図](img/a.png)](docs/a.md)` は、押すと `docs/a.md` を開く 1 つのリンクの「図」になる。`<a href="docs/a.md"><img src="img/a.png" alt="図"></a>` も外側のリンク先を開く
- `[![図](img/a.png)](#top)` は、押すと `img/a.png` を開く「図」になる
- http(s) の画像は、P8 で部品が描くと分かった書き方はそのまま、描かないと分かった書き方は名前になり、行き先は http(s) の URL そのもの（P12）
- 部品が描けない http(s) の `<img>` が HTML のかたまりの中にあれば、押せない文字になる。`<a href>` に包まれていれば外側のリンク先になる
- `data:` の画像はそのまま
- コードブロック・インラインコード・`<!-- -->` の中は書き換わらない
- `<picture>` の中の `<source>` と、`style` 属性の `background-image` は書き換わらない（`<img>` は書き換わる）
- `![仕様](spec.pdf)` を押した行き先は `spec.pdf`（開くときは種類の判定に従う。今の `openFile` の振る舞い）
そのうえで実機（WSL の space、P2 の確認用リポジトリ）で: 上の書き方を並べた `images.md` を `tab.new` で開き、`herdr-app shot` で、ローカル画像がすべて名前か「画像: …」の文字で出ていて、何も出ない画像が無いことを見る。
Left to the implementer: 書き換えの関数の分け方、HTML の属性の読み取りの細部（引用符の種類、属性の順番に依らないこと）。
Stop and hand back if: Step 1 で、整形表示が段落の中の `<img>` も `<a>` も描かず、本文ごと消すと分かったとき（書き換えで残せるか分からないため）。

## Step 7 — 通しの確認とガイドの更新

Purpose: 全体を反映して既存の振る舞いが壊れていないことを確かめ、受け入れの準備をする。Specification: このページの Specification のすべて。
Prerequisites: Step 6。
May change: `docs/guides/herdr-app-mod-development.md`、`.agents/scratch/fv-check/`。
Done when: 下の check がすべて通り、[受け入れの操作確認](#受け入れの操作確認) のための確認用ファイルが P2 の確認用リポジトリにそろっていて、項目ごとに WSL 側で結果を見るコマンド（`od -c`、`git diff`、`head -c 3 | od -An -tx1` など）が添えてある。実装で分かった事実がガイドの「制約」にある。実装者が開いた viewer のタブが残っていない。
Shown by: check — 順に `bun test`（全件）、`scripts/deploy.sh file-viewer`、`scripts/deploy.sh file-tree`、`herdr-app status` の `errors` が空、`herdr-app ls` に実装者が開いたタブが無い。
Left to the implementer: 確認用ファイルの中身。
Stop and hand back if: none。

## 受け入れの操作確認

cycle の最後の受け入れで、作業者が WSL の space（P2 の確認用リポジトリ）で行う。実装者は Step 7 で確認用ファイルと、WSL 側で結果を見るコマンドを用意して渡す。不合格の項目は cycle の修正に戻して直す。

1. CRLF が 8 行・LF が 2 行のファイルで、CRLF の 1 行目を書き換えて ctrl-s → `od -c` で LF の 2 行が LF のまま、差分は 1 行目だけ。どこかで Enter を押して行を足したときも、足した行が CRLF（実際の窓で Enter が入れる改行が LF でも CRLF でも同じ結果になるか）（[改行](../spec/file-viewer/editing.md#改行)）
2. 末尾に改行の無いファイルの最後で Enter → ctrl-s → 末尾に改行が付く。末尾の改行を消して ctrl-s → 消える（[改行](../spec/file-viewer/editing.md#改行)）
3. BOM 付きのファイルの 1 行を書き換えて ctrl-s → 先頭の 3 バイトが `ef bb bf` のまま、差分はその 1 行。Editor の先頭にカーソルを置いて左右に動かしても見えない文字が無い（[BOM](../spec/file-viewer/editing.md#bom)）
4. U+FFFD の文字を含む UTF-8 のファイルを編集して ctrl-s → 保存できる。Shift_JIS のファイルは編集できず、削除してから ctrl-s しても作り直さない（[UTF-8 でないファイル](../spec/file-viewer/editing.md#utf-8-でないファイル)）
5. 知らせの重なり（[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)）: (a) 編集中にターミナルから追記 → 外部変更の知らせ。もう一度追記しても知らせは 1 つ。そのまま ctrl-s → 3 択だけになる。「やめる」→ 2 秒ほどで外部変更の知らせが戻る。(b) 下書きを作ってから閉じ、ターミナルで書き換えてから開いて「復元」→「下書きの後にディスクが変わっている」だけが出る（外部変更の知らせは出ない）。そのまま編集してターミナルでもう一度書き換える → 外部変更の知らせも並ぶ。(c) 編集中に外部変更の知らせが出ている状態でファイルを削除し、「ディスクの内容で読み直す」→ 中身と編集が残り「ファイルが無くなった」が出る
6. Markdown の `[docs](docs/)` を押す → フォルダなので開けないと知らされ、タブは増えない。無いファイルへのリンクは今までどおり「ファイルが無い」（[リンク](../spec/file-viewer/viewers.md#リンク)）
7. `images.md` で、参照形式・`<img>`・リンクに包まれた画像・`#top` に包まれた画像・HTML のかたまりの中の画像の名前を押す → それぞれ仕様どおりの先が開く。Step 1 で作業者が押せなかった場合は、HTML のかたまりの中と段落の中の `<a>` が押せるかもここで確かめる（[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)）

## Verification map

| 仕様の節 | 示すステップ |
|---|---|
| [改行](../spec/file-viewer/editing.md#改行) | Step 2（テスト）、受け入れ 1・2 |
| [BOM](../spec/file-viewer/editing.md#bom) | Step 1（読み込みの事実）、Step 2（テスト）、受け入れ 3 |
| [UTF-8 でないファイル](../spec/file-viewer/editing.md#utf-8-でないファイル) | Step 3（テストと実機）、受け入れ 4 |
| [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき) | Step 4（テスト）、受け入れ 5 |
| [ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)・[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)（読み直したらファイルが無い、作り直すときに戻っていたら 3 択、読み取り専用は作り直さない） | Step 3・Step 4（P11、今の振る舞いを保つ）、受け入れ 4・5 |
| [下書き](../spec/file-viewer/editing.md#下書き)（復元は打ち込みを置き換える） | 今の実装のまま。Step 4 で壊さない |
| [リンク](../spec/file-viewer/viewers.md#リンク)（フォルダ） | Step 5（check）、受け入れ 6 |
| [ローカル画像](../spec/file-viewer/viewers.md#ローカル画像) | Step 1（部品の事実）、Step 6（テストと実機）、受け入れ 7 |
| [描けない図](../spec/file-viewer/mermaid.md#描けない図)（行番号） | Step 6（分けてから書き換える今の順を保つ。Done when） |
| [作らないもの](../spec/file-viewer/index.md#作らないもの)（`<source>`・CSS 背景、ツリーで開く） | Step 6（`<source>`・`background-image` を書き換えないテスト）。ツリーで開く処理は作らない（足すものが無い） |

## Left to the implementer

- 関数・ファイルの名前と分け方、lib の中の置き場所
- 知らせの帯の並び順と見た目（同梱 mod とテーマ色に揃える）
- 知らせの文言（[任せたこと](../spec/file-viewer/viewers.md#任せたこと)）

## Stop conditions

- 実機の確かめで、仕様の成功条件と食い違う事実が出たとき（例: Editor が BOM を消せないように隠せない、整形表示がどの書き方の画像も文字にできない）
- app home の同梱 mod・`keys.json`・`settings.json`・`shared.json` を直接編集しないと進めないと分かったとき
- 作業者のタブ・space を閉じる、layout を切り替える必要が出たとき

## Test command

`bun test`（`package.json` の `test`）。

## Out of scope

- [作らないもの](../spec/file-viewer/index.md#作らないもの) にあるもの（`<img>` 以外の HTML の画像、フォルダのリンクから Files のツリーを開くこと、UTF-8 以外の文字コードの編集）
- Windows ローカルの space と ssh の space での実機確認（[共通の前提](../spec/file-viewer/index.md#共通の前提)）
- 今回の改訂に関係しない既存の振る舞いの改善（例: ` ```mermaid ` で文書を分けているため、参照形式の普通のリンク `[x][id]` が定義と別の部分にあると部品で解決されない、今の振る舞い）
