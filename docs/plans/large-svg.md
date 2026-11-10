# 大きな SVG を表示の大きさで書き直す実装計画

File viewer 仕様の改訂（2026-11-11、コミット 1e687a5）を、今の `mods/file-viewer/` に入れる計画。改訂の中身は、image viewer の SVG を、画面に出す大きさで書き直したコピーで出すこと。実装ブランチは `large-svg`。

## Goal

書かれた大きさの大きい SVG を image viewer で開いても、app のメモリは画面に出す大きさの分で済む。小さい SVG を拡大してもくっきり出る。Mermaid の拡大の窓・`.mmd`・SVG 以外の画像の振る舞いは変わらない。

## Specification

- [表示の大きさで書き直す](../spec/file-viewer/viewers.md#表示の大きさで書き直す)（このサブ節の全部）。親の [SVG](../spec/file-viewer/viewers.md#svg) と [image viewer](../spec/file-viewer/viewers.md#image-viewer)、[開けないファイル](../spec/file-viewer/viewers.md#開けないファイル)、[整形の準備](../spec/file-viewer/viewers.md#整形の準備)（表示しているときだけ動かす・表示している間の時間で数える・1 区間 100 ms ほど）
- [拡大表示](../spec/file-viewer/mermaid.md#拡大表示)（書き出す面積の上限 4,096² とタイル）、[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)（同じ作りを使い回す元）
- [画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)（絵の席・共有・手放す時・初めの絵の席の数の下限）、[実機の確かめ](../spec/file-viewer/index.md#実機の確かめ)
- [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)、[UTF-8 でないファイル](../spec/file-viewer/editing.md#utf-8-でないファイル)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)
- [プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)（「開くとき」に入る場面）
- プラットフォームの事実: [mod 開発ガイド](../guides/herdr-app-mod-development.md)の「制約」の「`image(path)` のメモリ」「SVG の大きさの決め方」「`image(path)` の SVG の大きさ」「`image(path)` の読み込み」（読み込みの終わりは大きさを指定しない `image` の `on_size_change` で知る。失敗の知らせは無い）「長い同期処理」「UTF-8 の判定の時間」（QuickJS 上で時間を測った前例）、「確かめ専用の窓（playground）」の「メモリの測り方」「一瞬の空白の撮り方」

## Approach and why

### 今の作り（読んで分かったこと。HEAD 1e687a5）

- **image viewer の読み込み**（`main.js` の `readImage` → `copyPicture`）
  - 画像の鍵 `imageKey({ machine, path, size, mtime })`（`lib/seats.js`）で絵の席を取る。
  - ファイルはバイト列のまま `io.js` の `copyImage` でコピーする（このコンピュータは PowerShell、ほかの machine は base64 を `fs.writeFile`）。
  - 変化の確かめ（2 秒おき。`io.js` の `checkChanged`）の基準:
    - 画像は、このコンピュータではバイト列のハッシュ（`bytes: true`）、WSL では大きさと更新時刻が変わったときにハッシュを取って比べる。
    - ただし 1 MiB 以下の SVG は、Editor に入れるときに基準を文字のハッシュに上書きする（`readImage` の `file.base = text.base`）。だから 2 秒おきに全文を読んでハッシュを取っている。
  - 大きさと更新時刻が同じまま中身だけ変わったら、共有をやめてコピーし直す（`unshare`）。
  - SVG は、1 MiB 以下のとき（`lib/kind.js` の `source`）だけ `readText` で全文を読み、Editor に入れて `notUtf8` で判定する。`readText` は、このコンピュータでは herdr の `readTextFile`、WSL では `cat` で読む。
  - 寸法は `lib/image.js` の `imageSize({ svg })`。最初の `<svg …>` を正規表現で拾い、単位なしと `px` だけ読む。
- **表示**（`views/image.js`）: `zoomArea` の中で `image(file.cache).size_full()` を出す。ズーム（`views/zoom.js` の `Zoom`）は外の箱を伸び縮みさせるだけ。`Zoom` は `maxScale` を受け取れる（`main.js` の `diagramZoom`）。
- **`.mmd` の作り**: 仕様の SVG の書き直しの決まりは、これとほぼ同じ。
  - `lib/mmd.js` の `diagramFileState` は、`lib/markdown-state.js` の `MarkdownState` を、ファイル全体を図 1 つとして使う形。次のことを全部やっている。
    - 描画の外で準備する。
    - 表示している間だけ動かし、その間の時間で 10 秒を数える（`watch(now, visible)`）。
    - 書いてから読み込み終えるまで、前の絵を出す（見えない所で読み込ませる）。
    - 見た目（倍率・枠）が変わったら書き直す。
    - 中身が変わったら、前の結果を出したまま準備し直して差し替える。
    - 書き直しの失敗を知らせるだけのものにする（`display().notices`）。
  - 見た目は `main.js` の `mmdLook`。倍率か、枠の大きさに収める倍率で決まり、枠がまだ測れなければ窓の大きさで見積もる。
  - 絵の名前と大きさ・タイル・面積の上限は、`lib/diagram-files.js` の `diagramFile`・`fitLook`・`scaleLook`・`maxDiagramScale`・`TILE_SIDE`。
  - 書くのは `main.js` の `writeSvg`。共有の受け渡し（`mustWrite`・`awaiting`・`writing`・`wrote`）を自分でしてから、`writeSeatText` で書く（拡大の窓と開くときは、同じ受け渡しをする `writeSeatTile` を使う）。
  - 知らせは `file.notice`（1 つしか入らない。選択を待つ知らせもここ）とは別の並びで出す（`main.js` の `notices` の `shownNotices`）。閉じられない。
- **根の要素の書き換え**: `lib/mermaid/svg.js` の `resizeSvg` がある。ただし、文字列が `<svg` で始まり、`width` が `height` より前にある、自分で作った SVG しか扱えない。

### 作り方

- **SVG の image viewer を、`.mmd` と同じ作りの 3 つ目の使い手にする**。仕様の書き直しの決まり（表示している間だけ・10 秒・前の絵を出したまま・中身が変わったら差し替え・知らせ）は、`.mmd` の作りにもうある。だから新しい状態の仕組みは作らない。
  - SVG のファイル全体を、部分 1 つの文書として扱う。部分の「配置の大きさ」は書かれた大きさ、書き出しは「根の要素を書き換えた全文」。
  - 準備の始め方（`start`）だけを SVG 用にする。Step 1 の lib で根を読み、書き直す・元のまま・開けないに分ける。
  - `writeSvg` は、部分の種類で書き出しを選ぶ。Mermaid の図は `diagramSvg`、SVG は Step 1 の書き換え。どちらも今の `writeSvg` の共有の受け渡しを通す。
- **見た目は `.mmd` の `mmdLook` と同じ形**。倍率か枠に収める倍率で決め、上限は `maxDiagramScale`。SVG は色に関わらないので、色の鍵は決まった値にする。収まる倍率の上限は 1（今の画像と同じ `fitMax`）。開くときに枠がまだ測れなければ、`.mmd` と同じく、待つ間の要素で枠を測るか窓の大きさで見積もる。
- **表示は `.mmd` の図の出し方を使い回す**。出している絵の書いた大きさで、タイルを並べて出す。元のままコピーする SVG とほかの画像は、今の伸び縮みのまま。
- **知らせ**は `.mmd` と同じ道（`display().notices` から `shownNotices`）で出す。文言は SVG 用にする（「表示し直せなかった（理由）」）。`file.notice` には入れない。
- **見送った案**: 拡大の窓の書き直しの仕組み（`lib/zoom-svg.js` の `ZoomSvg`）を使い回す。次の 3 点で仕様に合わないので見送る。
  - 10 秒を実時間で数える（`watch` に `Date.now()` を渡す）。
  - 鍵が倍率と色だけで、中身が変わっても書き直しが始まらない。
  - 何も出していない状態から始められず、開くときの枠の大きさも測らない。
- **開くときの失敗**は、ツールバー（ソース表示のボタン）を残したまま、表示の場所に開けないファイルの案内（読み込みの失敗と理由）を出す。今の `type: "unopenable"` に替えると、ソース表示のボタンが消えるため。

### 仕様が決めていないことへの仮の答え

- **P1 app が描けない SVG の見分け方**
  - mod が見るところ:
    - 先頭の部分（BOM・XML 宣言・コメント・処理命令・DOCTYPE・空白）を飛ばして、最初の要素の開始タグを読む。
    - その名前が `svg` か。
    - 書かれた大きさが 0 以下か。
  - 開始タグが無い・`svg` でない・0 以下なら、すぐ開けないファイル（読み込みの失敗。理由は「SVG として読めない」など）にする。
  - それより後ろの XML の誤りは見ない。app が描けないので読み込みが終わらず、10 秒の打ち切りで開けないファイル（理由は「10 秒たっても読み込みが終わらなかった」）になる。読み込みの失敗を mod に知らせる呼び出しは無い（ガイドの「`image(path)` の読み込み」）。
  - 中身が変わって、開始タグの所で描けないと分かる SVG になったときも、開けないファイルにする（前の絵のまま知らせる、より、今の中身が描けないことを優先する）。後ろの XML の誤りは中身が変わったときも打ち切りでしか分からないので、仕様の「中身が変わったときの失敗」として前の絵のまま知らせる。誤りの場所で見え方が分かれる。
  - 名前空間（`xmlns`）が無い `<svg>` を app が描くかは確かめていない。Step 4 で確かめ、描かないなら、名前空間も見る形に P1 を改める（報告に書く）。
  - 覆す条件: 作業者が「XML の誤りは 10 秒待たずにすぐ知らせてほしい」と言ったとき（全文の整形式の確かめを足す）。または「中身が変わって描けなくなったら、前の絵のまま知らせてほしい」と言ったとき。
- **P2 `em`・`ex` の文字の大きさ**
  - 根の要素の `font-size` 属性か、`style` 属性の `font-size` を、ほかの長さと同じ読み方で px に直して使う。% は 12 に対する割合として読む。
  - キーワード・読めない値・無いときは 12（usvg の既定）。
  - 根に祖先は無いので、根だけを見る。
  - Step 4 で app の大きさと食い違ったら、読み方を合わせて直し、報告に書く。
  - 覆す条件: なし。
- **P3 共有の鍵**
  - 書き直した SVG の鍵は、画像の鍵（machine・パス・大きさ・更新時刻）、書く大きさ、タイルの位置からなる。図の鍵と重ならない形にする。
  - 中身の全文は鍵に入れない（6 MB の文字列を表に置かない）。
  - 大きさと更新時刻が同じまま中身だけ変わったときは、今の `unshare` と同じく、共有をやめて書き直す。
  - 覆す条件: なし（鍵の形は振る舞いに出ない）。
- **P4 変化の確かめの基準**
  - 1 MiB 以下の SVG（Editor に入れるもの）は今と同じ（文字のハッシュ。編集と保存の確かめに要る）。
  - 1 MiB を超える SVG は、ほかの画像と同じ基準にする（このコンピュータはバイト列のハッシュ、WSL は大きさと更新時刻が変わったときにハッシュ）。全文を読むのは、開くときと中身が変わったときだけ。2 秒おきに 6 MB を読まない。
  - 覆す条件: なし。
- **P5 1 MiB を超える SVG の読み方**
  - `readText` に、上限を渡せる形を足す。SVG は画像の上限（`IMAGE_LIMIT`、6,000,000 バイト）まで全文を読む。
  - 1 MiB を超える SVG は Editor に入れない（ソース表示のボタンを出さない、今の決まりのまま）。
  - UTF-8 の判定は、1 MiB を超える SVG にも `notUtf8` を当てる。今は Editor に入れるときだけ当てている。`notUtf8` は U+FFFD があるときだけバイト列を確かめ、その確かめは今も 25 万文字ずつ区切っている（ガイドの「UTF-8 の判定の時間」）。
  - 覆す条件: なし。
- **P6 区切り方**
  - 読む・根を読む・書き換える・書く・読み込ませるの間に、今のコードと同じ `pauseForApp()` か入出力の `await` を挟む。
  - 根を読むのは先頭から開始タグまでで、全文を何度も走査しない。書き換えは、開始タグの前・新しい開始タグ・後ろをつなぐ 1 回にする。
  - 6 MB の文字列での時間は、Step 1 で QuickJS の上で測る（ガイドの「UTF-8 の判定の時間」の前例と同じ方法）。どれか 1 区間が 100 ms を超えたら、そこを区切る。
  - 覆す条件: なし。
- **P7 ソース表示の間**
  - ソース表示を出している間は書き直さない。画像表示に戻ったときに、今の中身で書き直す（整形表示に戻るときと同じ形）。
  - 覆す条件: 作業者が「ソース表示の間も裏で書き直しておいてほしい」と言ったとき。
- **P8 中身が変わって、書き直す・元のまま・開けないの間を移るとき**
  - 新しい中身で分け直して、その道で出す。前の絵の席は、画像の置き場所の決まりで手放す。
  - 書き直すから元のままに移るときは、ズームの倍率を保つ。元のままから書き直すに移るときは、今の倍率で書く（上限を超えるなら上限の倍率）。
  - 覆す条件: なし。

## Scope of change

- `mods/file-viewer/lib/`
  - 新しい lib のファイル（SVG の根の要素の読み書きと、SVG 用の準備の始め方。名前は実装者に任せる）。
  - `image.js`: SVG の寸法を新しい読み方にする。
  - `diagram-files.js`: SVG の部分にも同じ名前・タイル・上限を当てる。
  - `mmd.js` か `markdown-state.js`: SVG の使い手を足すのに要る分だけ。
  - `seats.js`: 初めの数が下限に足りなければ `INITIAL_SEATS` を変える。仕様の「任せたこと」の範囲。
  - `reload.js`: 中身が変わったときに、ズームと書き直しの状態を引き継ぐのに要る分。
- `mods/file-viewer/main.js`: `readImage`・保存のあと・外部変更の読み直し・`writeSvg`・SVG の見た目・知らせ・描き方。
- `mods/file-viewer/io.js`: `readText` の上限を渡せる形。
- `mods/file-viewer/views/image.js`: 書き直した SVG の出し方と、開くときの失敗の案内。
- `tests/`: 新しい lib のテスト。`image-size.test.js`・`diagram-files.test.js`・`mmd.test.js`・`seats.test.js` に足す。
- `docs/guides/herdr-app-mod-development.md`: Step 1 と Step 4 で測った値と、確かめた事実。
- `docs/README.md`: この計画への 1 行。計画を消すときに一緒に消す。
- playground の app home（`%USERPROFILE%\.config\herdr-app-playground`）の `mods/`: Step 3・4。`scripts/deploy.sh` を `HERDR_APP_HOME`/`WSLENV` 付きで流す。

## Step order and prerequisites

- 順番: Step 1 → Step 2 → Step 3 → Step 4。
  - Step 1: SVG の根の要素の読み書きの lib。
  - Step 2: SVG を `.mmd` と同じ作りに載せる lib。書く大きさ・上限・タイル・鍵・初めの数。
  - Step 3: image viewer へのつなぎ。
  - Step 4: playground での確かめ。
- Step 2 は Step 1 の分け方を使う。Step 3 は両方を使う。Step 4 は全部のあと。
- Step 3 と Step 4 は playground を使う。
  - playground が動いていなければ、起動する前に作業者の許可を得る。
  - 起動し直すときも、1 回ごとに作業者の許可を得る。

## Step 1 — SVG の根の要素を読み、書き換える lib

Purpose: SVG の全文から、書かれた大きさと、書き直す・元のまま・開けないの分け方を決め、根の要素の `width`・`height`（と無ければ `viewBox`）を書き換えた全文を作る。Specification: [表示の大きさで書き直す](../spec/file-viewer/viewers.md#表示の大きさで書き直す)（書かれた大きさの読み方、元のままコピーする SVG、app が描けない SVG、ツールバーの寸法）。
Prerequisites: なし（HEAD 1e687a5）。
May change: 新しい lib のファイル、`mods/file-viewer/lib/image.js`、`tests/` の対応するテスト。
Done when:
- 下のテストが通り、`bun test` が全件通る。
- `lib/image.js` の `imageSize({ svg })` が、新しい読み方の値を返す。
- 6 MB の SVG の文字列で、根を読む・書き換えるのにかかる時間を、QuickJS の上で測ってガイドに書いてある。測り方はガイドの「UTF-8 の判定の時間」と同じ。
Shown by: test — 次のテストを足す（仕様の「書かれた大きさの読み方」「元のままコピーする SVG」「app が描けない SVG」と、ガイドの「SVG の大きさの決め方」による）:
  - 単位: `width="100mm"` は 377.95… px、`2in` は 192、`72pt` は 96、`1pc` は 16、単位なしと `px` はそのまま。根に `font-size="20"` があるとき、`2em` は 40、`2ex` は 20。
  - `width` か `height` が無いか % で、`viewBox` があるとき、その側は `viewBox` の大きさ（% はその割合）。
  - 先頭の XML 宣言・コメント・DOCTYPE・BOM を飛ばして根を見つける。コメントの中の `<svg` は拾わない。
  - `width` か `height` が無いか % で、`viewBox` も無いときは「元のまま」。
  - 根が見つからない・`svg` でない・書かれた大きさが 0 以下のときは「開けない」。
  - 書き換えた全文:
    - 根の要素の `width`・`height` が指定の値。
    - `viewBox` があればそのまま、無ければ書かれた大きさで足されている。
    - ほかの属性と、根の外の文字は変わらない。
    - 書き方は固定せず、読み直した値で確かめる。
Left to the implementer: lib のファイル名と関数の形、属性の読み方（引用符・空白・改行）、書き換えた値の数の書き方。`resizeSvg` を新しい書き換えに置き換えるか残すか（図の SVG の振る舞いが変わらないこと）。
Stop and hand back if: QuickJS の上で、6 MB の文字列の書き換えの 1 回（開始タグの前・新しいタグ・後ろをつなぐ）が 100 ms を超え、区切っても縮まない。区切り方の仕様の前提が崩れる。

## Step 2 — SVG を `.mmd` と同じ作りに載せる

Purpose: SVG のファイル全体を部分 1 つの文書として `MarkdownState` に載せる。書く大きさ・上限・タイル・等倍・共有の鍵が仕様どおりになるようにし、初めの絵の席の数が下限に足りることを確かめる。Specification: [表示の大きさで書き直す](../spec/file-viewer/viewers.md#表示の大きさで書き直す)、[拡大表示](../spec/file-viewer/mermaid.md#拡大表示)（面積の上限とタイル）、[画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)（共有・初めの絵の席の数の下限）、[整形の準備](../spec/file-viewer/viewers.md#整形の準備)（表示している間の時間で 10 秒）。
Prerequisites: Step 1。
May change: 新しい lib のファイル、`mods/file-viewer/lib/diagram-files.js`、`mods/file-viewer/lib/mmd.js`、`mods/file-viewer/lib/markdown-state.js`、`mods/file-viewer/lib/seats.js`、`tests/` の対応するテスト。
Done when: 下のテストが通る。`.mmd` と Markdown の今のテスト（`mmd.test.js`・`markdown-state.test.js`・`diagram-files.test.js`・`zoom-svg.test.js`）が変えずに通る。`bun test` が全件通る。
Shown by: test — 次のテストを足す:
  - 書く大きさは、書かれた大きさ × 倍率を整数 px に丸めたもの。収まる大きさは、枠に収まる倍率（1 まで）。
  - 面積が 4,096² を超える倍率は、上限の倍率に下がる。等倍（倍率 1）が上限を超えるとき（8000 × 8000）は、約 0.512 になる。
  - 中身が変わって、新しい書かれた大きさで今の倍率が上限を超えるときは、上限の倍率に下がる。
  - 辺が 4,096 を超える大きさ（例: 8,000 × 800 を倍率 1）は、4,096 以下のタイルに分かれ、隙間なく並ぶ。
  - 枠の大きさが変わっても、丸めた書く大きさが同じなら書き直さない。
  - 書いている間に倍率が 2 回変わったら、書き終えたあと最後の倍率だけを書き、途中の絵を読み込ませない。待つ間は前の絵を、その書いた大きさのまま出す。
  - 書き直しの 10 秒は、表示している間の時間で数える（止めている間は数えない）。
  - 中身が変わったら、前の絵を出したまま新しい中身を書き、読み込み終えてから替える。
  - 書き直しの失敗と打ち切りは、知らせるだけのもの（前の絵のまま）になる。開くときの失敗と打ち切りは、開けない案内（読み込みの失敗と理由）になる。
  - 「元のまま」「開けない」に分けた SVG は書き直さない。
  - 共有の鍵:
    - 同じファイル・同じ中身（大きさ・更新時刻）・同じ書く大きさなら同じになる。
    - 書く大きさかタイルの位置が違えば違う。
    - 図の鍵とも、元のままの画像の鍵とも重ならない。
  - 初めの絵の席の数で、[画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)の下限の場面を、絵の席を増やさずにできる。場面は、上限ちょうどの図の数の Markdown・テーマ 1 回・拡大の窓の倍率 1 回・image viewer の SVG の倍率 1 回で、差し替えの間に両方を使う分を含む。今の `seats.test.js` の場面のテストに足す。足りなければ `INITIAL_SEATS` を増やす。
Left to the implementer: SVG の使い手を `mmd.js` に足すか新しい lib にするか、`MarkdownState` に足す形。
Stop and hand back if: `MarkdownState` を変えないと SVG の決まりを満たせず、変えると `.mmd` か Markdown の今のテストが通らない。

## Step 3 — image viewer の SVG を書き直したコピーで出す

Purpose: image viewer で SVG を開く・倍率や枠の大きさを変える・中身が変わる（外部変更、ソース表示で保存して戻る）ときに、Step 2 の作りで書き直したコピーを絵の席に書いて出す。待つ間の見え方・失敗・元のまま・開けないを含め、仕様のとおりにする。Specification: [表示の大きさで書き直す](../spec/file-viewer/viewers.md#表示の大きさで書き直す)、[開けないファイル](../spec/file-viewer/viewers.md#開けないファイル)、[ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)、[UTF-8 でないファイル](../spec/file-viewer/editing.md#utf-8-でないファイル)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)。
Prerequisites: Step 1・2。playground が動いていること（動いていなければ、起動する前に作業者の許可を得る）。
May change: `mods/file-viewer/main.js`、`mods/file-viewer/io.js`、`mods/file-viewer/views/image.js`、`mods/file-viewer/lib/reload.js`、`mods/file-viewer/lib/kind.js`（要るなら）、`tests/` の対応するテスト。
Done when: `bun test` が全件通る。playground に入れて `check passed` になり、`status` の `errors` が空。
Shown by: check — 順に次を流す。
  1. `bun test`（全件）
  2. `HERDR_APP_HOME`/`WSLENV` を付けた `scripts/deploy.sh file-viewer` と `scripts/deploy.sh file-tree`（どちらも `check passed`。`file-tree` の `lib` は `file-viewer` の `lib` へのリンクなので、lib を変えたら両方を流す）
  3. playground の `status`（`errors` が空）
Left to the implementer: つなぎの分け方、開くときの失敗の案内の見た目、知らせの文言の細部。
Stop and hand back if:
- 開くときに枠がまだ測れず、窓の大きさで見積もった大きさで書くと、成功条件の前提（収まる大きさの絵が 1,000 × 1,000 論理 px 以下の枠で 64 MiB 以下）を満たせない。`.mmd` の測り方では足りないということになる。
- プレビュータブの中身の入れ替えや再起動の復元で、「読み込み中…」のまま進まない場面が出る。「表示している間だけ動かす」と「開くとき」の決まりが食い違う。

## Step 4 — playground で見え方とメモリを確かめる

Purpose: 仕様の成功条件と見え方を、確かめ専用の窓で確かめる。Specification: [表示の大きさで書き直す](../spec/file-viewer/viewers.md#表示の大きさで書き直す)の成功条件・反例・確かめ方、[実機の確かめ](../spec/file-viewer/index.md#実機の確かめ)、[画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)の確かめ方。
Prerequisites: Step 3。ガイドの「メモリの測り方」は、起動し直した直後の playground で測る。起動し直す前に、作業者の許可を 1 回得る。その 1 回のあと、下の手順を全部続けて測る。
May change: `docs/guides/herdr-app-mod-development.md`（測った値と確かめた事実）、playground の app home の `mods/`、作業用の見本（`.agents/scratch/` の下。コミットしない）。
Done when: 次を確かめ、結果をガイドと報告に書いてある。
- **メモリ**: 全部の viewer のタブを閉じた状態から、収まる大きさの絵が 1,000 × 1,000 論理 px 以下になる枠の大きさで、それぞれ 3 回測る。
  - 書かれた大きさ 8000 × 8000 の SVG を開いて 10 秒後の増え方が 64 MiB 以下。
  - 一番拡大してから収まる大きさに戻して 10 秒後も 64 MiB 以下。
  - ほかの viewer のタブが無いとき、閉じて 10 秒後、絵の席はどれもごく小さい絵。
  - 書き直したコピーの `<svg width height>` が表示の大きさになっていることも、絵の席の一覧で見る。
- **くっきり**: 32 × 32 のアイコンを 8 倍、8,000 × 800 を等倍（上限の倍率）にして `shot` で撮り、くっきりしていることを作業者に見せる画像として残す。
- **倍率を変えた直後**: 「一瞬の空白の撮り方」で 5 回ずつ続けて撮る。空白のコマが 0 枚。撮ったコマを残して、引き伸ばした・縮めた絵が無いかを人が見られるようにする。
- **見え方**（`shot` で見る）:
  - 開くとき・プレビュータブの中身の入れ替え・再起動で戻したタブを初めて出すときに「読み込み中…」を経て出る。
  - 寸法の表示は書かれた大きさで、`width="100mm"` は 378 × … px。
  - 外で書き換えたときと、ソース表示で色を書き換えて保存したときに、今の倍率のまま替わる。
  - 1 MiB を超える SVG（コメントで大きくした見本）も書き直して出る。
  - 根が `svg` でないファイルを `.svg` で開くと、ソース表示のボタンを残したまま、開けない案内（読み込みの失敗と理由）が出る。
  - 根は正しく、中の XML が壊れた SVG は、10 秒後に開けない案内になる（P1。打ち切りの道）。
  - `width="50%"` で `viewBox` の無い SVG と、Shift_JIS で書いた SVG は、元のままコピーされ、ズームで伸び縮みする。
- **app の大きさの読み方の確かめ**（P1・P2）: 使い捨ての見張りの mod（コミットしない）で、大きさを指定しない `image()` を `on_size_change` 付きで出す。app が決めた大きさを読み、mod の読み方と比べる（ガイドの「`image(path)` の読み込み」の方法）。
  - 比べる見本: `em` を使う SVG、`width` だけがあって `viewBox` の無い SVG、名前空間の無い `<svg>`。
  - 食い違いは P1・P2 のとおりに直し、ガイドと報告に書く。
Shown by: external — 確かめ専用の窓の app のプロセスの private bytes を外から測る（ガイドの「メモリの測り方」）。`herdr-app shot` と「一瞬の空白の撮り方」で撮り、`mods/file-viewer-images/` の一覧と大きさを見る。合格は上の値と見え方。くっきりしているかと、伸び縮みしたコマが無いかは、残した画像を作業者が見て決める。作業者の画面は取らない（ガイドの playground の決まり）。
Left to the implementer: 見本の中身、撮る場面の並べ方。
Stop and hand back if:
- 8000 × 8000 の SVG の増え方が 64 MiB を大きく超え、理由が書き直しの漏れでなく app の振る舞いにある（仕様の前提が崩れる）。
- `width` だけがあって `viewBox` の無い SVG を、app が指定どおりの大きさで描く。仕様の「書かれた大きさが決められない」の範囲が、app と食い違うことになる。

## Verification map

| 仕様 | 確かめる Step |
|---|---|
| [表示の大きさで書き直す](../spec/file-viewer/viewers.md#表示の大きさで書き直す)の書かれた大きさの読み方・元のまま・開けない・寸法 | Step 1（テスト）、Step 4（app の大きさと比べる） |
| 同じ節の書く大きさ・上限・タイル・等倍・書き直しの順・待つ間の絵・10 秒・中身が変わったとき・失敗・共有 | Step 2（テスト） |
| 同じ節の 1 MiB 超・表示している間だけ・開くとき・失敗の案内・UTF-8 でない SVG | Step 3（check）、Step 4（shot） |
| 同じ節の成功条件（64 MiB・くっきり・ぼやけない）と反例 | Step 4 |
| [拡大表示](../spec/file-viewer/mermaid.md#拡大表示)の上限とタイル（拡大の窓・`.mmd` は変えない） | Step 2（今のテストが変えずに通る） |
| [ほかの知らせが出ているとき](../spec/file-viewer/editing.md#ほかの知らせが出ているとき)（知らせるだけのもので、選択を待つ知らせを上書きしない） | Step 2（テスト）、Step 3 |
| [画像の置き場所](../spec/file-viewer/index.md#画像の置き場所)の初めの絵の席の数の下限 | Step 2（テスト） |

## Left to the implementer

- 新しい lib のファイル名、関数の形、内部の分け方。どれも振る舞いを変えないため。
- 知らせと開けない案内の文言の細部。伝える中身は仕様で決まっているため。

## Stop conditions

- 各 Step の「Stop and hand back if」。
- 仕様の決まりのどれかが、app の振る舞い（測った事実）と食い違うと分かったとき。
- 作業者の app に mod を入れる必要が出たとき。入れずに、受け入れの前まで playground だけで確かめる。
- playground を起動する・起動し直す・閉じる必要が出たとき。作業者の許可を得る。

## Test command

`bun test`（リポジトリの直下で、全件）。

## Out of scope

- 本文の図のメモリ（画面の外の図も残る件）。仕様の「決めていないこと」にあって、別の壁打ちで決める。
- 拡大の窓と `.mmd` の振る舞いの変更。上限を仕様に書いただけで、作りは変えない。
- SVG 以外の画像の表示。
- 見えている所だけを書く作り。
