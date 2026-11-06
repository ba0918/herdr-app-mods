# File viewer 実装計画

[File viewer 仕様](../spec/file-viewer/index.md) を実装する計画。実装ブランチは `file-viewer`。

## Goal

herdr-app の Files パネルで押したファイルが、メイン領域の viewer のタブに開き、code / markdown / image / Mermaid 図で表示・編集できる状態にする。利用者は layout を `main-viewer` に切り替えれば使える。

## Specification

- [File viewer 仕様（入口）](../spec/file-viewer/index.md) — 共通の前提、作らないもの、任せたこと
- [開き方とタブ](../spec/file-viewer/opening-and-tabs.md)
- [viewer](../spec/file-viewer/viewers.md)
- [Mermaid 図](../spec/file-viewer/mermaid.md)
- [編集・保存と外部変更](../spec/file-viewer/editing.md)
- 用語: [CONTEXT.md](../../CONTEXT.md)
- プラットフォームの事実と制約: [mod 開発ガイド](../guides/herdr-app-mod-development.md)（特に「この環境の構成」「一次情報（読む順）」「開発ループ」「組み込み方」「制約」）

## Approach and why

### 作り方の全体

- **コマンドの呼び方**: この計画で `herdr-app <サブコマンド>` と書くものは、ガイドの「開発ループ」の `$APP`（Windows 側の `herdr-app.exe`。PATH には無い）で呼ぶ。`$WINHOME` の求め方も同じ節にある。app home は `$WINHOME/.config/herdr-app`（環境変数 `HERDR_APP_HOME` が Windows 側で設定されていればそちら）。`check` には `wslpath -w` で変換したパスを、`shot` には Windows 形式の出力パスを渡す。使えるサブコマンド（`ls` / `status` / `do` / `commands` / `check` / `shot`）は `"$APP" --help`、command の引数は `"$APP" commands` で確かめる。作業を始める前に、ガイドの「一次情報（読む順）」の 3 ファイル（app home の `AGENTS.md`・`herdr.d.ts`・`gpui-kit.d.ts`）を読む。
- **ソースはリポジトリが正**。`mods/file-viewer/`、`mods/file-tree/`、`layouts/main-viewer.json` をリポジトリに置き、`scripts/deploy.sh` で app home にコピーして確かめる。app home 側を直接編集しない。
- **純粋な処理と、アプリに触る処理を分ける**。判断の部分（種類の判定・上限・タブ名・ツリーで押したときに何をするか・リンク解決・ローカル画像の差し替え・保存の分割・改行の保持・下書きの選び方・画像寸法・Mermaid の解析）は、`herdr` / `gpui-kit` を import しない ES モジュール（`mods/file-viewer/lib/`）にして `bun test` で単体テストする。仕様の「確かめ方」が単体テストを指定している処理はすべてここに入る。
- **lib は QuickJS で動く書き方に限る**。mod の実行環境（QuickJS）には `TextEncoder` が無く、`Buffer` の base64 変換とバイナリの扱いに不具合がある（ガイドの「制約」）。lib ではこれらを使わず、UTF-8 のバイト数や base64 の変換は自前の純 JS で行う。bun で通っても実機で壊れることを防ぐため、lib を import する `main.js` を `herdr-app check` に通すことも各ステップの確認に含める。
- **実機での確かめ方を 2 つに分ける（P13）**。実装者は GUI をクリック・入力できない。そこで、CLI から起こせること（`herdr-app do tab.new` で viewer のタブを直接開く、WSL のターミナルからのファイルの書き換え・削除、`herdr-app ls` / `status` / `shot`、`herdr-app do <mod>.<command>`）は各ステップで実装者が確かめる。クリック・ダブルクリック・キー入力・ホイール・ドラッグ・テーマ切り替え・アプリの終了と起動が要る確認は、[受け入れの操作確認](#受け入れの操作確認) に集め、cycle の最後の受け入れで作業者が行う。
- **順番**: 足場 → 純粋な処理 → タブ → 編集・外部変更 → 下書き → Markdown → 画像 → Mermaid → 通しの確認。タブ（Step 4）が以降すべての土台で、そこで「viewer が自分のタブを特定できるか」が成り立たないと先に進めないので早い段階に置く。Mermaid は最も不確かで独立しているので最後に置き（配置を単体テストで確かめる Step 10 と、描画の Step 11 に分ける）、ほかの viewer を先に使える状態にする。

### 仕様が決めていないことへの仮の答え

それぞれ、覆す条件（作業者がこう言えば変える）を添える。

- **P1 テストの道具**: `bun test`（mise で入っている bun）。テストは `tests/` に置き、`mods/file-viewer/lib/` を import する。覆す条件: 別の道具を指定されたとき。
- **P2 反映の方法**: `scripts/deploy.sh <mod名>` が `mods/<mod名>/` を app home の `mods/<mod名>/` にコピーし（生成物 `gpui-kit.d.ts` / `jsconfig.json` は除く）、続けて `herdr-app check` を実行して、その終了コードを返す。`scripts/deploy.sh layout` は `layouts/main-viewer.json` をコピーし、`herdr-app status` の `errors` が空かを見る。シンボリックリンク等は使わない（Windows 側のアプリが WSL 上のリンクを読めるかが未検証のため。ガイドの「未検証事項」）。覆す条件: リンクで直接読ませたいと言われたとき。
- **P3 mod のコピー間の連携**: viewer のタブはタブごとに別の mod のコピーとして動く。どのタブが何を開いているか、各 space のプレビュータブ、表示の切り替え、プレビュー / 固定は、`shared()` / `setShared()` の `file-viewer:` で始まるキーで持つ（`shared()` は再起動後も残る。`herdr.d.ts`）。各 viewer のタブは、`tab.new` の props に入れた一意な token で自分を名乗る。props はタブと一緒に保存されるので、再起動後も同じ token で戻る。タブが閉じられたら、そのタブの `shared` の記録を消す。覆す条件: props だけで足りると分かったとき。
- **P4 layout の複製で画面を変えない**: 仕様どおり `layout.clone` で `main-viewer` を作るが、`layout.clone` は複製先に画面を切り替える。そこで実行前に `herdr-app status` の `layout` を記録し、直後に `layout.switch` でその layout に戻す。以後も実機確認のために `main-viewer` に切り替えたら、確認が終わり次第記録した layout に戻す。戻せなかったとき（`layout.switch` が失敗する、`status` の `layout` が記録と違う）は作業を止めて作業者に知らせる。切り替えている時間は `shot` を撮る数秒に限る。作業者はその間もアプリを使ってよい（作業者が自分で layout を変えたときは、実装者はそれを戻さず、次の記録からその layout を使う）。覆す条件: すぐ `main-viewer` に切り替えてよいと言われたとき。
- **P5 ディスクの「基準」の持ち方**: 基準は内容の sha256。WSL・ssh の machine では machine 側の `sha256sum` で取る（mod 内のハッシュは `Buffer` を渡すと壊れるため。ガイドの「制約」）。2 秒ごとの確認は、まず `stat` で更新時刻と大きさを見て、変わったときだけハッシュを取り直す。Windows ローカルの space では、2 秒ごとに `readTextFile` で読み（1 MiB 以下）、その文字列を mod 内の `createHash("sha256").update(文字列)` でハッシュして比べる（文字列なら正しい）。覆す条件: `stat` が変わらないのに内容が変わる場面が見つかったとき（毎回ハッシュを取る）。
- **P6 画像の寸法**: 画像の先頭を JS で読んで寸法を取る（PNG / JPEG / GIF / WebP / BMP / ICO。SVG は width / height / viewBox 属性）。読めない形式や壊れたヘッダでは「寸法不明」と出し、ファイルサイズは出す。覆す条件: 寸法が出ない画像を開けない扱いにしたいと言われたとき。
- **P7 ctrl-s の受け方**: viewer の要素の `on_key_down` で受ける。`keys.json` は触らない（一度でも編集すると既定ショートカットの更新が止まる。AGENTS.md）。覆す条件: Editor にフォーカスがあると ctrl-s が mod に届かないと分かったとき → Step 5 の停止条件。
- **P8 Windows ローカルの space**: 保存は `writeTextFile(path, text, expected)`（`expected` と今の内容が違えば書かずに失敗する。`herdr.d.ts`）、画像は PowerShell でローカルのパスから app home へコピーする。WSL・ssh の space は `exec` の分割書き込みと base64 の運搬（ガイドの「制約」）。実機では WSL の space だけ確かめる（[共通の前提](../spec/file-viewer/index.md#共通の前提)）。覆す条件: なし。
- **P9 下書きの形式と「開いているタブ」**: `file-viewer-drafts/` に 1 下書き 1 つの JSON ファイル（machine、パス、内容、基準のハッシュ、最終更新時刻、タブの token）。仕様の「開いている viewer のタブのどれのものでもない下書き」の「開いているタブ」は、**今このアプリの中で動いていて、ほかのタブとして生きているコピー**とする。生きているコピーは `shared` に token と 3 秒ごとの更新時刻を書き、10 秒以上更新の無いものは生きていないとみなす。アプリの起動直後は、ほかの復元されたタブが印を書き直すまで誤って「生きていない」と見えるので、ほかの token の下書きを候補にするのは、そのコピーが動き出してから 10 秒後以降に限る。自分の token の下書きは、自分が起動したときに復元の候補にする（再起動・異常終了の後、戻ったタブで「下書きから復元を聞く」ため。[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)、[下書き](../spec/file-viewer/editing.md#下書き)）。覆す条件: なし（仕様の成功条件を満たすための読み方）。
- **P10 Markdown と図の組み合わせ**: 整形表示の部品（TextView）の中に図を埋め込めないので、Markdown を ` ```mermaid ` ブロックの境目で区切り、文章の部分は TextView、図の部分は図の要素として縦に並べる。覆す条件: なし。
- **P11 ローカル画像の差し替え**: 整形表示に渡す前に、Markdown 内のローカル画像 `![alt](相対パス)` を、特別な URL のリンク（代替テキスト、無ければファイル名）に置き換え、`on_link_click` で受けて image viewer のタブを開く。覆す条件: なし。
- **P12 表示中かどうか**: viewer のタブが「表示中」とは、そのタブの space が表示中で、かつそのタブが space の中で選ばれていること（`spaces()` の space と tab の `active`）。覆す条件: なし。
- **P13 実機の確かめ方の分担**: [作り方の全体](#作り方の全体) の最後から 2 つ目の項目のとおり。GUI の操作が要る確認は [受け入れの操作確認](#受け入れの操作確認) にまとめ、作業者が受け入れのときに行う。覆す条件: GUI を操作する手段（作業者が許可する自動操作）が用意されたとき。
- **P14 実機確認用のファイル**: 実機確認で書き換え・削除・作り直しをするファイルは、リポジトリの `.agents/scratch/fv-check/`（ignore 済み）に作った使い捨ての git リポジトリに置く。作業者のリポジトリのファイルは使わない。覆す条件: なし。

## Scope of change

- `mods/file-viewer/`（新規）: `main.js`、`mod.json`（`"place": "none"`）、`lib/`（純粋な処理）、`io.js`（machine とのファイル入出力）、表示部品の JS、アイコン SVG、同梱ライブラリと `THIRD-PARTY-NOTICES`（使う場合）
- `mods/file-tree/`（同梱 `files` の複製から作る。`mod.json` は `"place": "none"`）
- `layouts/main-viewer.json`（同梱 `main` の複製から作る）
- `scripts/deploy.sh`（新規）、`tests/`（新規）、`package.json`（bun 用。依存は入れない）
- `.gitignore`（`jsconfig.json` を足すかどうかは実装者に任せる）
- `docs/guides/herdr-app-mod-development.md`（実装で分かった事実の追記。Step 12）
- 作業者の app home の `mods/file-viewer/`、`mods/file-tree/`、`layouts/main-viewer.json`、`file-viewer-cache/`、`file-viewer-drafts/`。確かめるための反映先で、リポジトリの変更ではない

それ以外の app home のファイル（同梱 mod、同梱 layout、`keys.json`、`settings.json`）は変更しない。

## Step order and prerequisites

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12。各ステップの「Shown by」が通らなければ次に進まない。

実機での確認は作業者の herdr-app（Windows）と WSL の space で行う。実装者が開いた viewer のタブは確認の後に閉じる。作業者のターミナルのタブ・ペインは閉じない。

## Step 1 — 足場: file-tree・main-viewer の複製と反映スクリプト

Purpose: 同梱品の複製をリポジトリに取り込み、反映と確認を 1 コマンドでできるようにする。Specification: [共通の前提](../spec/file-viewer/index.md#共通の前提)。
Prerequisites: herdr-app が起動していて、WSL の space があること。`bun --version` が通ること。
May change: `mods/file-tree/`、`layouts/main-viewer.json`、`scripts/deploy.sh`、`package.json`、`tests/`、`.gitignore`、app home の同名ファイル。
Done when: `herdr-app do mod.clone '{"name":"files","as":"file-tree"}'` と、P4 の手順での `herdr-app do layout.clone '{"name":"main","as":"main-viewer"}'` で作った複製を、app home からリポジトリの `mods/file-tree/` と `layouts/main-viewer.json` にコピーしてある（生成物を除く）。画面は P4 で記録した layout に戻っている。`mods/file-tree/mod.json` は `"place": "none"`。`layouts/main-viewer.json` の `panel-body` の子のうち id `files` のブロックの `content.mod` が `file-tree` で、id は `files` のまま。
Shown by: check — 順に `scripts/deploy.sh file-tree`（終了コード 0、出力に `check passed`）、`scripts/deploy.sh layout`（`herdr-app status` の `errors` が空）、`herdr-app status` の `layout` が記録した layout と同じ。
Left to the implementer: スクリプトの書き方（bash）、`package.json` の中身。
Stop and hand back if: `mod.clone` / `layout.clone` が失敗し、同梱品のファイルを直接コピーするしかないとき（同梱品の直接編集は次の起動で `-edited` 扱いになりうるため）。

## Step 2 — 純粋な処理（タブと viewer の判断）

Purpose: タブと viewer の判断を、アプリ抜きで確かめられる関数にする。Specification: [種類の判定](../spec/file-viewer/viewers.md#種類の判定)、[上限](../spec/file-viewer/viewers.md#上限)、[タブ名](../spec/file-viewer/opening-and-tabs.md#タブ名)、[プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[同じファイルは既存のタブに切り替える](../spec/file-viewer/opening-and-tabs.md#同じファイルは既存のタブに切り替える)、[リンク](../spec/file-viewer/viewers.md#リンク)、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)、[image viewer](../spec/file-viewer/viewers.md#image-viewer)。
Prerequisites: Step 1。
May change: `mods/file-viewer/lib/`、`tests/`。
Done when: 下のテストが通る。
Shown by: test — RED → GREEN → REFACTOR で `bun test`:
- `kind`: パス・大きさ・内容から viewer の種類か開けない理由を返す（`Makefile` → code、`logo.SVG` → image、NUL を含む `a.bin` → バイナリ、2 MiB のテキスト → 上限超え、7,000,000 バイトの PNG → 上限超え、2 MiB の SVG → image でソース表示なし、NUL を含む `.md` → バイナリ）
- `limitMessage`: 上限超えの案内に上限とファイルの大きさが入る（「上限 1 MiB、このファイル 2.0 MiB」の形）
- `tabTitle`: 同じ space の viewer タブの一覧と状態から各タブ名を返す（`◇ main.js`、`main.js ●`、同名が 2 つで `main.js · files`）
- `openAction`: 今の space の viewer タブの一覧（ファイル、プレビュー / 固定）と、押したファイル・シングル / ダブルクリックから、することを返す（既存タブへの切り替え、プレビューに出ているファイルのダブルクリックで固定、プレビューの入れ替え、ダブルクリックでプレビューを入れ替えて固定、新しいタブを今のタブの右に開く）
- `resolveLink`: Markdown のパスとリンクから開くファイルを返す（相対パス、`#見出し` を除く、同じファイル内の `#` だけは何もしない、http(s) はブラウザ行き）
- `rewriteLocalImages`: `![構成図](img/arch.png)` を代替テキストのリンクに、代替テキストが無ければファイル名のリンクにし、http(s) の画像はそのまま
- `imageSize`: PNG / JPEG / GIF / WebP / BMP / ICO / SVG の小さな見本の先頭から幅と高さ、壊れたヘッダで「不明」（P6）
Left to the implementer: 関数名・ファイルの分け方・戻り値の形。
Stop and hand back if: none。

## Step 3 — 純粋な処理（編集・保存・下書きの判断）

Purpose: 保存と下書きの判断を、アプリ抜きで確かめられる関数にする。Specification: [編集と保存](../spec/file-viewer/editing.md#編集と保存)、[文字コードと改行](../spec/file-viewer/editing.md#文字コードと改行)、[下書き](../spec/file-viewer/editing.md#下書き)。
Prerequisites: Step 2。
May change: `mods/file-viewer/lib/`、`tests/`。
Done when: 下のテストが通る。
Shown by: test — `bun test`:
- `splitForWrite`: 内容を、UTF-8 で 1 断片 100,000 バイト以下に分け、連結すると元に戻る（日本語、サロゲートペア、改行を含む 370 KB の文字列。UTF-8 のバイト数は自前で数える）
- `preserveLineEndings`: CRLF / LF / 末尾改行の有無を、読んだときのとおりに戻す（Editor が LF に揃えて返しても、CRLF のファイルは CRLF で書き戻す）
- `looksNonUtf8`: U+FFFD を含めば true
- `draftsFor`: machine とパスで下書きを特定し、生きているほかのコピーの token のものを除き、自分の token のものは含め、新しい順に並べる（P9）
- `expiredDrafts`: 最後の更新から 30 日を過ぎたものだけを返す
Left to the implementer: 関数名・戻り値の形。
Stop and hand back if: none。

## Step 4 — viewer のタブ: 入出力・開き方・プレビュー・タブ名・位置・ツリーの表示元

Purpose: ファイルを読んで viewer のタブに開き、仕様どおりにタブを扱う。表示は code viewer と開けない案内まで。Specification: [ツリーで押したら viewer のタブに開く](../spec/file-viewer/opening-and-tabs.md#ツリーで押したら-viewer-のタブに開く)、[プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[同じファイルは既存のタブに切り替える](../spec/file-viewer/opening-and-tabs.md#同じファイルは既存のタブに切り替える)、[タブ名](../spec/file-viewer/opening-and-tabs.md#タブ名)、[タブの位置](../spec/file-viewer/opening-and-tabs.md#タブの位置)、[viewer のタブを見ている間のツリー](../spec/file-viewer/opening-and-tabs.md#viewer-のタブを見ている間のツリー)、[code viewer](../spec/file-viewer/viewers.md#code-viewer)、[開けないファイル](../spec/file-viewer/viewers.md#開けないファイル)、[上限](../spec/file-viewer/viewers.md#上限)。
Prerequisites: Step 3。
May change: `mods/file-viewer/`、`mods/file-tree/`。
Done when: `mods/file-viewer/mod.json` が `"place": "none"`。`io.js` が P5・P8 の方式で「読む（内容と基準）」「基準が変わったか」「基準と同じなら書く」「画像を `file-viewer-cache/` にコピーする」を持つ。`file-tree` のファイルの押下が Step 2 の `openAction` を通って viewer のタブを開く。そのうえで、下の観察がすべて成り立つ。
Shown by: external — `scripts/deploy.sh file-viewer` と `scripts/deploy.sh file-tree` の後（どちらも `check passed`。mod を置いた直後の `tab.new` は `no mod` で失敗することがあるので、数秒おいて再試行する。ガイドの「制約」）、P14 の確認用リポジトリを WSL の space で開いた状態で:
1. `herdr-app do tab.new` で `file-viewer` のタブを props（パス・machine・token・プレビュー）付きで開くと、`herdr-app ls` にそのタブが出て、タブ名が `◇ <ファイル名>` になっている（viewer のコピーが自分のタブを特定して `tab.rename` できた証拠）。
2. 同じ方法で 3 つ目のタブとして開くと、`herdr-app ls` で開いた位置のタブのすぐ右に並ぶ。
3. `.js` を開いた画面を `herdr-app shot` で見ると、行番号と色分けがある。NUL を含むファイルと 2 MiB のテキストでは、理由・パス・大きさの案内が出る。
4. 確認の後、開いたタブを閉じ、layout を P4 で記録したものに戻す。
クリックでの開き方・プレビューの入れ替え・ダブルクリック・ツリーの表示元・折り返しボタンは [受け入れの操作確認](#受け入れの操作確認) で作業者が見る。
Left to the implementer: viewer 内のボタンの並べ方（[任せたこと](../spec/file-viewer/index.md#任せたこと)）、`shared` のキーの細かい形。
Stop and hand back if: viewer のコピーが自分のタブを確実に特定できないとき（プレビューの入れ替え・タブ名・タブの位置が作れないため）。WSL の `sha256sum` / `stat` / `mv` が使えないとき。

## Step 5 — 編集・保存・外部変更・ファイルが消えたとき

Purpose: テキストを編集して安全に保存でき、外の変更に追従する。Specification: [編集と保存](../spec/file-viewer/editing.md#編集と保存)、[保存前のディスク確認](../spec/file-viewer/editing.md#保存前のディスク確認)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)、[文字コードと改行](../spec/file-viewer/editing.md#文字コードと改行)。
Prerequisites: Step 4。
May change: `mods/file-viewer/`。
Done when: 編集・ctrl-s・3 択・「編集を続ける」・作り直しの確認・読み取り専用の知らせが作られている。編集でプレビュータブが固定タブになり、タブ名に ` ●` が付く。下の観察が成り立つ。
Shown by: external — `scripts/deploy.sh file-viewer` の後、P14 の確認用リポジトリで:
1. `a.js` を viewer のタブで表示したまま、WSL のターミナルで書き換える → 2 秒ほど後の `herdr-app shot` で新しい内容が出ている。
2. 表示中の `a.js` を削除する → `shot` に「ファイルが無くなった」が出て、中身は表示されたまま。元に戻すと通常の表示に戻る。
3. Shift_JIS のファイルを開く → `shot` に UTF-8 でない可能性の知らせが出ている。
編集と ctrl-s が要る確認（保存の結果を `diff` で比べる、370 KB の保存、3 択と「やめる」、「編集を続ける」の後に再び知らせないこと、作り直し、CRLF の 1 行の保存で `git diff` が 1 行、変更なしの ctrl-s で何も起きないこと、書き込めないファイルの保存で理由が出て ` ●` が残ること）は [受け入れの操作確認](#受け入れの操作確認) で作業者が行い、実装者は WSL 側のファイルの中身でその結果を確かめられるように手順を書いておく。
Left to the implementer: 知らせ・確認の見た目（[任せたこと](../spec/file-viewer/index.md#任せたこと)）。
Stop and hand back if: Editor にフォーカスがある間 ctrl-s が mod の `on_key_down` に届かないと分かったとき（P7。`keys.json` に `mod:file-viewer` を足すかを作業者に聞く。作業者の確認なしに `keys.json` を編集しない）。

## Step 6 — 下書き

Purpose: 未保存の編集が、閉じる・終了・異常終了で失われない。Specification: [下書き](../spec/file-viewer/editing.md#下書き)。
Prerequisites: Step 5。
May change: `mods/file-viewer/`。
Done when: 編集中 3 秒ごとの更新、閉じるときの書き込み、開いたときの「復元 / 破棄」（複数なら新しい順）、復元で固定タブになること、復元後の基準、保存・復元・破棄での削除、30 日での自動削除が Step 3 の関数を使って作られている。下の観察が成り立つ。
Shown by: external — `scripts/deploy.sh file-viewer` の後、app home の `file-viewer-drafts/` に P9 の形式の下書きファイルを 1 つ手で置き（P14 の確認用ファイルについて、どの生きたタブの token でもないもの）、そのファイルを `herdr-app do tab.new` で開くと、`herdr-app shot` に「復元 / 破棄」が出る。P9 の JSON の最終更新時刻を 31 日前にした下書きは、viewer が動き出した後に `file-viewer-drafts/` から消えている。閉じる・強制終了・2 つの space・保存で下書きが消えること・選ばなかった下書きが残ることは [受け入れの操作確認](#受け入れの操作確認) で作業者が行う。
Left to the implementer: 下書きファイルの名前の作り方（P9 の範囲内）。
Stop and hand back if: none。

## Step 7 — markdown viewer

Purpose: Markdown を整形表示で読み、リンクを辿れる。Specification: [markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)、[リンク](../spec/file-viewer/viewers.md#リンク)、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)、[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)。
Prerequisites: Step 6。
May change: `mods/file-viewer/`。
Done when: 整形表示 / ソース表示の切り替え（タブごと、`shared` に保存して再起動後も保つ）、プレビューの入れ替えで整形表示に戻ること、リンクとローカル画像の処理（Step 2 の関数）が作られている（Mermaid ブロックはこの時点ではコードのまま）。下の観察が成り立つ。
Shown by: external — `scripts/deploy.sh file-viewer` の後、P14 の確認用リポジトリの見出し・表・コードブロック・ローカル画像を含む `README.md` を `herdr-app do tab.new` で開き、`herdr-app shot` で整形表示とローカル画像の代わりの文字を見る。表示したまま WSL のターミナルで `README.md` の見出しを書き換え、2 秒ほど後の `shot` で整形表示が新しい内容になっている。リンクを押す・ソース表示に切り替える・再起動は [受け入れの操作確認](#受け入れの操作確認) で作業者が行う。
Left to the implementer: none。
Stop and hand back if: none。

## Step 8 — image viewer と SVG

Purpose: 画像を拡大・移動して見られ、SVG はソースも編集できる。Specification: [image viewer](../spec/file-viewer/viewers.md#image-viewer)、[SVG](../spec/file-viewer/viewers.md#svg)、[上限](../spec/file-viewer/viewers.md#上限)、[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)。
Prerequisites: Step 7。
May change: `mods/file-viewer/`。
Done when: 枠に収める表示、ズーム（ボタン・ctrl+ホイール）、ドラッグ、等倍 / 収まるボタン、寸法とファイルサイズ、`file-viewer-cache/` のコピーの寿命（入れ替えで古いものを消す、閉じたら消す、起動後に使われていないものを消す）、SVG のソース表示（1 MiB 超は出さない）が作られている。下の観察が成り立つ。
Shown by: external — `scripts/deploy.sh file-viewer` の後、P14 の確認用リポジトリで:
1. 大きな PNG を `herdr-app do tab.new` で開く → `shot` で全体が枠に収まり、寸法とファイルサイズが出ている。`file-viewer-cache/` にコピーが 1 つある。
2. 表示したまま WSL のターミナルで画像を差し替える → 2 秒ほど後の `shot` で新しい画像になり、`file-viewer-cache/` の古いコピーが消えている。
3. タブを `herdr-app do tab.close` で閉じる → `file-viewer-cache/` からコピーが消える。
4. webp / ico / bmp / gif / jpg と SVG を開き、`shot` で表示されることを見る。7,000,000 バイトを超える画像で上限の案内が出る。2 MiB の SVG で画像は出るがソース表示のボタンが無い。
ズーム・ドラッグ・SVG のソース編集と保存は [受け入れの操作確認](#受け入れの操作確認) で作業者が行う。
Left to the implementer: ズームの段階と上限。
Stop and hand back if: webp / ico / bmp のどれかが herdr-app の画像表示で出ないとき（仕様の拡張子の表と食い違うため、その形式を開けないファイル扱いにするかを作業者と決める）。

## Step 9 — Mermaid の解析

Purpose: flowchart と sequenceDiagram の文を、描くための構造か描けない理由にする。Specification: [描く図](../spec/file-viewer/mermaid.md#描く図)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)、[色](../spec/file-viewer/mermaid.md#色)。
Prerequisites: Step 2（`lib/` とテストの置き方）。
May change: `mods/file-viewer/lib/mermaid/`、`tests/`。
Done when: 下のテストが通る。
Shown by: test — `bun test`:
- `parseFlowchart`: 範囲の表の書き方（向き、ノードの形、4 種の矢印とラベル、subgraph、style / classDef / class）をノード・辺・入れ子・色にする
- `parseSequence`: participant / actor / as、6 種の矢印、Note、alt / else / opt / loop、activate / deactivate と + / - を参加者とメッセージの並びにする
- `mermaidError`: 未対応の種類（`classDiagram`）、範囲外の書き方（`click`、`autonumber`）、文法エラーを、ファイル全体の行番号つきで返す（ブロックの中身の 1 行目がファイルの 41 行目のとき、中身の 3 行目の誤りは 43 行目になる）
Left to the implementer: 構文解析の作り方。
Stop and hand back if: none。

## Step 10 — Mermaid の配置

Purpose: 解析した図の、ノード・辺・参加者の位置を決める処理を作り、単体テストで確かめる。Specification: [描く図](../spec/file-viewer/mermaid.md#描く図)（確かめ方: 解析と配置の処理は単体テスト）、[同梱してよいライブラリ](../spec/file-viewer/mermaid.md#同梱してよいライブラリ)。
Prerequisites: Step 9。
May change: `mods/file-viewer/lib/mermaid/`、`tests/`、同梱ライブラリとそのライセンス表記。
Done when: 配置の方法が決まっている。最初に、候補の純 JS ライブラリ（例: dagre。MIT）を ES モジュールとして同梱し、lib の規則（QuickJS に無い API を使わない）を満たし `herdr-app check` に通るか試す。満たさなければ、層に分けて並べる簡単な配置を自前で書く（[任せたこと](../spec/file-viewer/index.md#任せたこと)）。テキストの幅は文字数から見積もる（全角は半角の 2 倍）。同梱ライブラリがあれば、そのライセンス表記がリポジトリにある。下のテストが通る。
Shown by: test — `bun test`:
- `layoutFlowchart`: 見本の flowchart（`flowchart LR; A-->B; B-->C`、分岐と合流、subgraph 入り）で、ノードの箱が互いに重ならない、辺の端がノードの箱の縁にある、LR では A・B・C の x が増えていく、subgraph の枠が中のノードを囲む
- `layoutSequence`: 見本の sequenceDiagram で、参加者の列が宣言順に左から並び、メッセージが記述順に上から下へ並ぶ、alt / loop の枠が中のメッセージを囲む
Left to the implementer: ライブラリを使うか自作するか、配置の作り方（[任せたこと](../spec/file-viewer/index.md#任せたこと)）。
Stop and hand back if: ライブラリも自前の配置も、見本の flowchart を重ならずに並べられないとき。

## Step 11 — Mermaid の描画と組み込み

Purpose: 解析した図を、Markdown の中と .mmd で描き、拡大して見られるようにする。Specification: [描く図](../spec/file-viewer/mermaid.md#描く図)、[拡大表示](../spec/file-viewer/mermaid.md#拡大表示)、[色](../spec/file-viewer/mermaid.md#色)、[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)、[同梱してよいライブラリ](../spec/file-viewer/mermaid.md#同梱してよいライブラリ)、[描けない図](../spec/file-viewer/mermaid.md#描けない図)。
Prerequisites: Step 10、Step 8（拡大表示の操作を共有する）。
May change: `mods/file-viewer/`。
Done when: Step 10 の配置を使い、ノードを位置指定の要素、辺を `window.paint_path`（`gpui-kit.d.ts`）の線にして描き、P10 で Markdown と組み合わせ、.mmd も図で開き、図を押すと overlay で拡大できる。下の観察が成り立つ。
Shown by: external — `scripts/deploy.sh file-viewer` の後、P14 の確認用リポジトリの、`flowchart LR; A-->B; B-->C`・subgraph と style を使う flowchart・sequenceDiagram の見本・`classDiagram`・誤りのある図を含む `diagrams.md` と、`flow.mmd` を `herdr-app do tab.new` で開き、`herdr-app shot` で見る: 図が本文の幅に収まって描かれ、箱と矢印が重ならない。`style` の色が出ている。`classDiagram` と誤りのある図はコードのまま、理由（種類名 / ファイル全体の行番号）付き。`flow.mmd` は図で出る。図を押した拡大表示、ライト / ダークの切り替え、`.mmd` のソース編集、ライセンス表記の確認は [受け入れの操作確認](#受け入れの操作確認) で作業者が行う。
Left to the implementer: 描画の作り方（[任せたこと](../spec/file-viewer/index.md#任せたこと)）。
Stop and hand back if: `paint_path` でもほかの要素でも矢印を描けないとき。

## Step 12 — 通しの確認とガイドの更新

Purpose: 自動で確かめられることを通しでもう一度確かめ、分かった事実を残し、受け入れの準備をする。Specification: [File viewer 仕様](../spec/file-viewer/index.md) の全見出し。
Prerequisites: Step 11。
May change: `docs/guides/herdr-app-mod-development.md`、必要な修正のための `mods/` と `tests/`。
Done when: 実装で分かったプラットフォームの事実（タブの特定方法、ctrl-s の受け方、`paint_path` の使い方、mod から使えた／使えなかった API など）がガイドの該当節に追記されている。ガイドの「未検証事項」のうち、この実装で確かめたものだけを消す。[受け入れの操作確認](#受け入れの操作確認) の各項目に、作業者が使う確認用ファイル（P14）が用意されている。
Shown by: check — 順に `bun test`、`scripts/deploy.sh file-viewer`、`scripts/deploy.sh file-tree`、`scripts/deploy.sh layout`、`herdr-app status` の `errors` が空、Step 4〜11 の Shown by の観察をもう一度行って合格。
Left to the implementer: none。
Stop and hand back if: none。

## 受け入れの操作確認

cycle の最後の受け入れで、作業者が `main-viewer` に切り替えた窓の WSL の space（P14 の確認用リポジトリ）で行う。実装者は Step 12 までにこの一覧の確認用ファイルを用意し、各項目の結果を WSL 側で確かめる方法（`diff`、`git diff`、`ls`）を添えて渡す。アプリの終了・強制終了・起動とテーマの切り替えは作業者が行い、テーマは確認の後に元に戻す。不合格の項目は、cycle の修正に戻して直す。

1. ツリーで a.js → b.js をシングルクリック → タブは 1 つで中身が b.js（[プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)）
2. a.js をダブルクリックしてから b.js をシングルクリック → a.js の固定タブと b.js のプレビュータブ。プレビューに c.js が出ているときに c.js をダブルクリック → 固定される。プレビューに a.js が出ているときに d.js をダブルクリック → タブ 1 つで d.js の固定タブ
3. 固定タブの a.js を再び押す → そのタブに切り替わり、タブ数は同じ（[同じファイルは既存のタブに切り替える](../spec/file-viewer/opening-and-tabs.md#同じファイルは既存のタブに切り替える)）
4. 別フォルダの同名ファイルを開く → 両方に親フォルダ名（[タブ名](../spec/file-viewer/opening-and-tabs.md#タブ名)）
5. ターミナルで `docs/` にいてツリーから `guides/a.md` を開く → ツリーは `docs/` のまま、`guides/` も展開されたまま（[viewer のタブを見ている間のツリー](../spec/file-viewer/opening-and-tabs.md#viewer-のタブを見ている間のツリー)）
6. `.js` の折り返しボタン（[code viewer](../spec/file-viewer/viewers.md#code-viewer)）
7. `a.js` を書き換えて ctrl-s → WSL 側の内容が一致、` ●` が消える。約 370 KB のファイルでも同じ。変更なしの ctrl-s で何も起きない。書き込めないファイルの保存で理由が出て ` ●` が残る（[編集と保存](../spec/file-viewer/editing.md#編集と保存)）
8. 編集中にターミナルから追記して ctrl-s → 3 択、「やめる」でディスクに追記が残る（[保存前のディスク確認](../spec/file-viewer/editing.md#保存前のディスク確認)）
9. 編集中に外で書き換え → 知らせ、「編集を続ける」で同じ変化は再び知らせない（[外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する)）
10. 表示中のファイルを削除して ctrl-s → 作り直すか聞かれ、作り直すと元に戻る（[ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら)）
11. CRLF のファイルの 1 行を変えて保存 → `git diff` が 1 行（[文字コードと改行](../spec/file-viewer/editing.md#文字コードと改行)）
12. 編集して × で閉じ、開き直す → 復元できる。編集中に herdr-app を強制終了して起動し直す → 3 秒前までの編集を復元できる。2 つの space で同じファイルを編集して閉じる → 両方が新しい順に出て、選ばなかった下書きは残る。保存すると下書きが消える。復元後にディスクが変わっていれば知らせが出て、保存で 3 択（[下書き](../spec/file-viewer/editing.md#下書き)）
13. Markdown のソース表示で見出しを変えて整形表示に戻す → 変えた見出しが出る。プレビューで別の .md に移ると整形表示に戻る。相対リンク・`#見出し` 付き・http・存在しない先のリンクを押す。ローカル画像の代わりの文字を押す → image viewer のタブ（[markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer)、[リンク](../spec/file-viewer/viewers.md#リンク)、[ローカル画像](../spec/file-viewer/viewers.md#ローカル画像)）
14. プレビュータブと、ソース表示の Markdown・ソース表示の SVG・ソース表示の .mmd の固定タブを用意して herdr-app を終了・起動 → 同じ状態で戻る。`file-viewer-cache/` に使われていないコピーが残っていない（[再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元)、[image viewer](../spec/file-viewer/viewers.md#image-viewer)）
15. 画像の ctrl+ホイールとボタンでの拡大、ドラッグ、等倍 / 収まる。`icon.svg` のソースで色を変えて保存 → 画像の色が変わる（[image viewer](../spec/file-viewer/viewers.md#image-viewer)、[SVG](../spec/file-viewer/viewers.md#svg)）
16. Mermaid 図を押す → overlay で拡大でき、Esc で閉じ、タブ数は同じ。ライト / ダークを切り替えて図の色が変わる（確認後にテーマを戻す）。`flow.mmd` をソース表示にして編集できる（[拡大表示](../spec/file-viewer/mermaid.md#拡大表示)、[色](../spec/file-viewer/mermaid.md#色)、[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル)）
17. 同梱ライブラリのライセンス表記と同梱ファイルを確認する（[同梱してよいライブラリ](../spec/file-viewer/mermaid.md#同梱してよいライブラリ)）

## Verification map

| 仕様の見出し | 確かめるところ |
|---|---|
| [共通の前提](../spec/file-viewer/index.md#共通の前提) | Step 1、12 |
| [ツリーで押したら viewer のタブに開く](../spec/file-viewer/opening-and-tabs.md#ツリーで押したら-viewer-のタブに開く) | Step 4、受け入れ 1 |
| [プレビュータブ](../spec/file-viewer/opening-and-tabs.md#プレビュータブ)、[同じファイルは既存のタブに切り替える](../spec/file-viewer/opening-and-tabs.md#同じファイルは既存のタブに切り替える) | Step 2（`openAction`）、受け入れ 1〜3 |
| [タブ名](../spec/file-viewer/opening-and-tabs.md#タブ名) | Step 2（`tabTitle`）、Step 4、受け入れ 4 |
| [タブの位置](../spec/file-viewer/opening-and-tabs.md#タブの位置) | Step 2（`openAction`）、Step 4 |
| [再起動後の復元](../spec/file-viewer/opening-and-tabs.md#再起動後の復元) | 受け入れ 14 |
| [viewer のタブを見ている間のツリー](../spec/file-viewer/opening-and-tabs.md#viewer-のタブを見ている間のツリー) | 受け入れ 5 |
| [種類の判定](../spec/file-viewer/viewers.md#種類の判定)、[上限](../spec/file-viewer/viewers.md#上限) | Step 2（`kind`、`limitMessage`）、Step 4・8 |
| [code viewer](../spec/file-viewer/viewers.md#code-viewer) | Step 4、受け入れ 6 |
| [開けないファイル](../spec/file-viewer/viewers.md#開けないファイル) | Step 4 |
| [markdown viewer](../spec/file-viewer/viewers.md#markdown-viewer) | Step 7、受け入れ 13 |
| [リンク](../spec/file-viewer/viewers.md#リンク) | Step 2（`resolveLink`）、受け入れ 13 |
| [ローカル画像](../spec/file-viewer/viewers.md#ローカル画像) | Step 2（`rewriteLocalImages`）、Step 7、受け入れ 13 |
| [image viewer](../spec/file-viewer/viewers.md#image-viewer) | Step 2（`imageSize`）、Step 8、受け入れ 14・15 |
| [SVG](../spec/file-viewer/viewers.md#svg) | Step 8、受け入れ 15 |
| [描く図](../spec/file-viewer/mermaid.md#描く図) | Step 9（解析）、Step 10（配置）、Step 11 |
| [描けない図](../spec/file-viewer/mermaid.md#描けない図) | Step 9、Step 11 |
| [拡大表示](../spec/file-viewer/mermaid.md#拡大表示)、[Mermaid 単体ファイル](../spec/file-viewer/mermaid.md#mermaid-単体ファイル) | Step 11、受け入れ 16 |
| [色](../spec/file-viewer/mermaid.md#色) | Step 9、Step 11、受け入れ 16 |
| [同梱してよいライブラリ](../spec/file-viewer/mermaid.md#同梱してよいライブラリ) | Step 10、受け入れ 17 |
| [編集と保存](../spec/file-viewer/editing.md#編集と保存) | Step 3（`splitForWrite`）、受け入れ 7 |
| [保存前のディスク確認](../spec/file-viewer/editing.md#保存前のディスク確認) | 受け入れ 8 |
| [外で書き換えられたら追従する](../spec/file-viewer/editing.md#外で書き換えられたら追従する) | Step 5・7・8、受け入れ 9 |
| [ファイルが消えたら](../spec/file-viewer/editing.md#ファイルが消えたら) | Step 5、受け入れ 10 |
| [文字コードと改行](../spec/file-viewer/editing.md#文字コードと改行) | Step 3（`preserveLineEndings`、`looksNonUtf8`）、Step 5、受け入れ 11 |
| [下書き](../spec/file-viewer/editing.md#下書き) | Step 3（`draftsFor`、`expiredDrafts`）、Step 6、受け入れ 12 |

## Left to the implementer

- 関数・ファイル・`shared` のキーの名前と、モジュールの分け方。
- viewer 内のボタンやツールバーの並べ方と見た目（テーマ色を使い、同梱 mod に揃える）。
- Mermaid の配置計算・描画の方法と、同梱ライブラリの選定（[同梱してよいライブラリ](../spec/file-viewer/mermaid.md#同梱してよいライブラリ)の条件内）。
- `jsconfig.json` をコミットするか ignore するか。

## Stop conditions

各ステップの「Stop and hand back if」に加えて:

- 仕様の成功条件が、プラットフォームの制約で成り立たないと分かったとき（例: 2 秒ごとの確認 1 回の往復が平均 500 ms を超える、`tab.new` の mod タブが再起動で復元されない）。成り立たせるために仕様と違う振る舞いを作らない。
- 作業者の app home のうち、[Scope of change](#scope-of-change) に挙げた以外のファイルを変える必要が出たとき。
- 実装者は herdr-app を終了・強制終了・起動しない。テーマも切り替えない。これらは [受け入れの操作確認](#受け入れの操作確認) で作業者が行う。

## Test command

`bun test`（リポジトリの直下で実行。P1）。

## Out of scope

[作らないもの](../spec/file-viewer/index.md#作らないもの) のとおり。加えて、Windows ローカルと ssh の space での実機確認、同梱 mod（`files` / `changes` / `tabs`）の変更。
