// file-viewer: 1 つのタブに 1 つのファイルを、内容に合った viewer で表示・編集する。
// タブは tab.new {mod: "file-viewer", props: {token, path, machine, preview, index}} で開かれる。
import { View, div, image } from "gpui-kit";
import { randomUUID } from "crypto";
import { v_flex, h_flex, Editor, EditorState, SliderState } from "gpui-base";
import { spaces, props, theme, settings, run, notify, openOverlay, closeOverlay } from "herdr";
import { kind, languageFor, unopenableReason, extension, IMAGE_LIMIT } from "./lib/kind.js";
import { formatSize, formatSizes } from "./lib/size.js";
import { tabTitles } from "./lib/tabs.js";
import { splitBom, contentToSave, looksNonUtf8 } from "./lib/save.js";
import { draftsFor, expiredDrafts, restoredDraft, offersDrafts } from "./lib/drafts.js";
import { resolveLink } from "./lib/markdown.js";
import { externalNoticeAction, showsDraftChanged } from "./lib/notices.js";
import { reloadOutcome, carryOver } from "./lib/reload.js";
import { normalizePath } from "./lib/path.js";
import { imageSize, base64ToBytes } from "./lib/image.js";
import { layoutMermaid } from "./lib/prepare.js";
import { MarkdownState } from "./lib/markdown-state.js";
import { diagramFile, bodyLook, scaleLook, fitLook, colorsKey, maxDiagramScale, maxSvgScale, tileView } from "./lib/diagram-files.js";
import { oldCacheNames } from "./lib/pictures.js";
import { IMAGES_DIR, imageKey, unshare, awaiting, setShown, shownOf, holds, ensureTable, startGen, beat, claimInit, stopInit, initPlan, initDone, rendered, use as useSeats, dropPlace, takeReleases, released, seatOf, isSeatName, bodyPlace, windowPlace, watch, scan } from "./lib/seats.js";
import { SeatUser } from "./lib/seat-user.js";
import { diagramFileState, diagramFileView } from "./lib/mmd.js";
import { svgFileState, svgFileView, svgLook, svgSource } from "./lib/svg-file.js";
import { readSvgRoot, rewriteSvg } from "./lib/svg-root.js";
import { diagramSvg, diagramColors, resizeSvg } from "./lib/mermaid/svg.js";
import { ZoomSvg, DiagramOpening } from "./lib/zoom-svg.js";
import { OverlayLayout } from "./lib/overlay-layout.js";
import { record, putRecord, viewerTabsIn, findOwnPane, pruneRecords, openTokens, liveViewerTokens, openFile } from "./registry.js";
import { readText, checkChanged, checkUtf8, statOf, pathKind, writeText, WriteConflict, listDrafts, writeDraft, deleteDraft, draftName, copyImage, pauseForApp } from "./io.js";
import { listOldCache, removeOldCache, removeOldCacheDir } from "./io.js";
import { listSeats, makeSeatsDir, writeSeatText, writeTinySeats } from "./io.js";
import { markdownBody, markdownWaiting, waitingLabel, preloadImages, diagramImage, bodyWidth, diagramError, thumbSpan, BAR_MAX, BAR_INSET, BAR_WIDTH } from "./views/markdown.js";
import { BodyScroll, BodyInput, measuredParts } from "./lib/body-scroll.js";
import { imageBody, imageInfo } from "./views/image.js";
import { Zoom, zoomTools, zoomArea } from "./views/zoom.js";

const POLL_MS = 2000;
// 画像の中身が変わって新しいコピーに替えるとき、新しいコピーを app が読み込み終えるのを待つ上限（読み込めない画像でも替える）。
const IMAGE_SWAP_WAIT_MS = 5000;
const DRAFT_MS = 3000;
// 描画の外の整形の準備の 1 区間（仕様の「整形の準備」。ガイドの「長い同期処理」の 0.5 秒より十分短く）。
const PREPARE_SLICE_MS = 100;
// 図の拡大の窓の大きさ（タブの窓に対する割合）。
const OVERLAY_WIDTH = 0.92, OVERLAY_HEIGHT = 0.9;
// 図の絵の SVG の名前（大きな絵はタイルごと）。
const tilesOf = (f) => f.tiles ?? [f];
const tileNames = (f) => tilesOf(f).map((t) => t.name);
// 図の拡大（拡大の窓・.mmd）の倍率の上限: 書き出す絵の面積の上限に収まる倍率（lib/diagram-files.js）。
const diagramMaxScale = (width, height) => maxDiagramScale({ width, height });
const diagramZoom = (options = {}) => new Zoom({ ...options, maxScale: diagramMaxScale });
const svgMaxScale = (width, height) => maxSvgScale({ width, height });
// 絵の席に書き終えてから、見えない所で読み込ませるまで待つ時間。書いた絵自身の変化の知らせが読み込みのあとに届くと、読み込んだ絵が
// 捨てられて一瞬空白になる（ガイドの「フォルダの変化の知らせ」。250 ms 待てば空白が出なかった）。
const SEAT_SETTLE_MS = 250;
// 差し替えたあと、差し替えた描画が来るのを待つ上限（来なければ POLL_MS の回に手放す）。
const FRAME_WAIT_MS = 1000;
// 図の拡大の窓で、配置が止まっていないかを見る間隔。
const OVERLAY_WATCH_MS = 1000;
// 整形表示の部品が中身を描くのを待つ上限（何も描かない部分は高さが来ないので）。縮んでから数える（lib/body-scroll.js）。
const BODY_WAIT_MS = 1500;
// 整形表示のスクロールバーを、スクロールしてから出しておく時間（app のスクロールバーに合わせる。ガイドの「制約」の「スクロールバー」）。
const BAR_KEEP_MS = 2000;
// 文字を選びながら本文の上下の端の帯（この高さ）に来たら、本文をスクロールし続ける。速さは帯の外側ほど速い（px / 秒）。
const DRAG_EDGE = 32, DRAG_SPEED_MIN = 200, DRAG_SPEED_MAX = 1500;
// 本文の非同期の繰り返し（端でのスクロールと、部品が中身を描くのを見る処理）が、この時間進まなければ止まったと見なす
// （ガイドの「長い同期処理」。lib/body-scroll.js の Lease）。スクロールバーを消す描き直しの予定も、この時間過ぎても来なければ入れ直す。
const BODY_STALE_MS = 1000;

function syntaxColors(t) {
  return { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 };
}

const themeKey = (t) => `${t.background}|${t.foreground}|${t.ansi5}`;
const fileKey = (machine, path) => `${machine ?? null}\n${path}`;
const message = (e) => String(e?.message ?? e);
// コピーの世代（init ごとに変わる値。hot reload のあとの新しいコピーを、止まった前のコピーと見分ける。lib/seats.js）。
const newGen = () => `${Date.now().toString(36)}-${randomUUID()}`;

const pad = (n) => String(n).padStart(2, "0");
function when(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 整形表示の知らせ（lib/markdown-state.js の display().notices の 1 つ）の文言。
function markdownNotice(n) {
  if (n.kind === "over" && n.by === "bytes") {
    const [limit, size] = formatSizes(n.limit, n.size);
    return `大きすぎるので整形表示をせず、ソース表示で開いている（整形表示の上限 ${limit}、今の内容 ${size}）`;
  }
  if (n.kind === "over") return `図が多すぎるので整形表示をせず、ソース表示で開いている（整形表示の上限 図 ${n.limit} 個、今の内容 図 ${n.size} 個）`;
  if (n.kind === "image") return `画像を押せる名前にできなかったので、画像と図をそのまま表示している（${n.message}）`;
  if (n.kind === "write") return `図を書き出せなかったので、画像と図をそのまま表示している（${n.message}）`;
  if (n.kind === "restyle-write") return `図を書き出せなかったので、図は前の色や大きさのまま表示している（${n.message}）`;
  if (n.kind === "restyle-timeout") return "整形の準備が終わらなかったので、図は前の色や大きさのまま表示している";
  return "整形の準備が終わらなかったので、画像と図をそのまま表示している";
}

// 書き直した SVG の知らせ（lib/svg-file.js の svgFileView の notices の 1 つ。倍率を変えたときと中身が変わったときの失敗）の文言。
function svgNotice(n) {
  return `表示し直せなかった（${n.kind === "restyle-timeout" ? "10 秒たっても読み込みが終わらなかった" : n.message}）`;
}

// 部分（図か SVG）のファイル file のタイル tile に書く SVG の全文。図は配置の大きさの SVG を、SVG は元の全文の根の要素を書き換える。
function partSvg(part, colors, file, tile) {
  if (part.type === "svg") return rewriteSvg(part.text, part.root, { width: file.width, height: file.height, tile: tilesOf(file).length > 1 ? tile : null });
  const l = part.layout;
  return diagramSvg(l, colors, { width: tile.width, height: tile.height, view: tileView(file, tile, l) });
}

function button(id, label, t, onClick, active = false) {
  return div().id(id).h(24).px(8).flex_none().items_center().justify_center().rounded(6).cursor_pointer().text_size(12)
    .text_color(active ? t.foreground : t.muted).when(active, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)).child(label);
}

export default class FileViewer extends View {
  init(_props, cx) {
    const p = props() ?? {};
    // 図の拡大表示（タブの上に重ねる窓）として開かれたコピー。
    if (p.mermaid !== undefined) {
      // 開いたタブのコピーが書いた SVG（svg: 配置の大きさの SVG の文字列、shown: 開いたときに出す絵）を受け取り、倍率が変わったら
      // width と height だけを替えて書き直す（lib/zoom-svg.js）。テーマが変わったら、図を描画の外で配置し直して新しい色で書く
      // （layout: lib/overlay-layout.js）。絵は、開いたタブの印（token）の窓の使う場所で絵の席の表に数える（開いたときの絵は、タブが
      // 窓の集まりに入れてから渡す。本文と共有する絵の席は、本文が使わなくなっても窓が出している間は手放さない）。
      // 窓が出している絵は窓の使う場所に置き（trackOverlayPictures）、同じ窓のコピーが init し直したら（hot reload など）、開いたときの
      // 絵ではなくそれから始める。どちらの絵も、その絵の席が窓の集まりにあって書き終えたままその絵の鍵の絵を持っていなければ（もう
      // 手放して別の絵になっていうる。開いたタブが確かめられずに集まりに入れなかったときも）、出さずに同じ倍率と色の絵を書き直してから出す。
      const colors = p.colors ?? diagramColors(theme());
      this.overlay = {
        source: p.mermaid, firstLine: p.firstLine ?? 1,
        size: { width: p.layoutWidth ?? 1, height: p.layoutHeight ?? 1 },
        zoom: diagramZoom({ fitMax: 3 }), layout: null, running: null,
        colors: { [colorsKey(colors)]: colors }, svgs: { [colorsKey(colors)]: p.svg ?? null }, zs: null,
      };
      let start = p.shown ? { file: p.shown, colorsKey: colorsKey(colors) } : null, untrusted = false;
      if (p.token) {
        this.seats = ensureTable(globalThis, Date.now(), { poll: POLL_MS });
        this.seatOwner = { place: windowPlace(p.token), gen: newGen() };
        startGen(this.seats, this.seatOwner, Date.now());
        this.seatUser = new SeatUser(this.seats, this.seatOwner);
        this.seatTurns = new Map();
        const kept = shownOf(this.seats, this.seatOwner.place);
        if (kept) {
          start = kept;
          this.overlay.colors[kept.colorsKey] ??= kept.colors;
        }
        untrusted = Boolean(start) && !holds(this.seats, this.seatOwner.place, tilesOf(start.file));
      }
      if (start) this.overlay.zs = new ZoomSvg({ shown: start.file, colorsKey: start.colorsKey, untrusted });
      if (this.seatUser && this.overlay.zs) this.seatUser.use([...this.overlay.zs.keep()]);
      cx.timer.every(OVERLAY_WATCH_MS, (cx) => this.watchOverlay(cx));
      return;
    }
    this.token = p.token ?? null;
    // 絵の席の表（lib/seats.js。窓の globalThis に 1 つ）と、このコピーの本文の使う場所。gen はこのコピーの世代（hot reload のあとの
    // 新しいコピーを、止まった前のコピーと見分ける）。
    if (this.token) {
      this.seats = ensureTable(globalThis, Date.now(), { poll: POLL_MS });
      this.seatOwner = { place: bodyPlace(this.token), gen: newGen() };
      startGen(this.seats, this.seatOwner, Date.now());
      this.seatUser = new SeatUser(this.seats, this.seatOwner);
      // 絵の席の名前を新しく使い始めた回数（見えない所で読み込ませる要素の id に入れ、前に同じ名前で読み込んだ要素と分ける）。
      this.seatTurns = new Map();
      cx.spawn(async () => this.initSeats());
    }
    // コピーしている途中の画像の名前（読み込んだ file を採るか捨てるまで、使っている絵に入れる）。
    this.copying = new Set();
    // init の時点の spaces() はまだ開く前の状態で、各 space で選ばれていたタブを指す。
    // props に位置が無いとき（CLI から開いたときなど）は、そのタブの右に置く。
    this.activeBefore = Object.fromEntries(spaces().map((s) => [s.id, s.tabs.find((t) => t.active)?.id ?? null]));
    this.pane = null;
    this.me = null;
    this.file = null;
    this.loadedKey = null;
    this.wrap = false;
    this.pendingTitle = null;
    this.mdBox = {};
    // 整形表示の本文のスクロールの位置（lib/body-scroll.js）と、スクロールバーのつまみ。開いた中身ごとに位置を始めから数える。
    this.mdScroll = new BodyScroll();
    this.bar = SliderState.new({ min: 0, max: BAR_MAX, step: 1, value: BAR_MAX });
    this.bar.on("change", (v, cx) => {
      // syncBar が合わせた値が返ってきただけなら、スクロールしたことにしない（スクロールバーを出さない）。
      const echo = this.barSet !== null && Math.abs(Number(v) - this.barSet) <= 1;
      if (this.mdScroll.moveToFraction(1 - v / BAR_MAX)) { if (!echo) this.showBar(cx); cx.notify(); }
    });
    // 本文で覚えている操作の印（スクロールバーの出し入れ、帯の上のマウス、押しているボタン、非同期の繰り返し）。
    // 描画のたびに body() で今の描画に合わせて解く（lib/body-scroll.js の BodyInput）。
    this.input = new BodyInput({ keepMs: BAR_KEEP_MS, staleMs: BODY_STALE_MS });
    // syncBar がつまみに最後に合わせた値（まだなら null）。
    this.barSet = null;
    // スクロールバーを消すために描き直す予定の時刻（予定が無ければ null）。
    this.barDue = null;
    // 前の描画で本文の場所に出したもの（"formatted" | "source" | "preparing" | "loading" | null）と、本文の部品が中身を描くまで
    // 上に重ねる前の表示（同じ値の 1 つか null）。
    this.bodyShown = null;
    this.mdCover = null;
    // Markdown の整形表示の見え方（lib/markdown-state.js）。開いた中身ごとに作り、外部変更の読み直しや下書きの復元では残す
    // （this.file は読み直しで入れ替わるので、そこには置かない）。
    this.md = null;
    // 描画の外の準備を動かしている非同期処理の印（runPreparation が作る。動かしていなければ null）。
    this.preparing = null;
    this.focus = cx.focus_handle();
    cx.timer.every(POLL_MS, (cx) => {
      this.noticeHidden();
      this.watchPreparation(cx);
      this.poll(cx);
      if (this.seats) {
        beat(this.seats, this.seatOwner, Date.now());
        cx.spawn(async (cx) => this.watchSeats(cx));
      }
    });
    // 表示していないタブでも動き続けるので、閉じるときに呼ばれない場合（裏のタブを閉じた、強制終了）も
    // 数秒前までの編集が下書きに残る。
    cx.timer.every(DRAFT_MS, (cx) => this.keepDraft(cx));
  }

  // 閉じるとき（アプリの終了を含む）は、未保存の編集を下書きに書く。止める手段は無いので確認は出さない。
  // タブは本文の、図の拡大の窓は窓の使う場所を絵の席の表から外し、どこも使わなくなった絵の席を手放し始める（閉じた使う場所の描画は
  // 待たない。250 ms で終わらなくてよい。残りはほかのタブの見張りがする。仕様の「画像の置き場所」）。窓は、新しい窓に替わったあとなら
  // 窓の使う場所を外さない。書き始めていない絵の席の書く印と、始めていない絵の席を増やす受け持ちと、初めての手放しの受け持ちは外す
  // （ほかのコピーが待たないように）。
  async close() {
    if (this.overlay) {
      if (this.seats) {
        this.seatUser.stop();
        dropPlace(this.seats, this.seatOwner.place, this.seatOwner);
        await this.stopInitSeats();
        await this.releaseSeats();
      }
      return;
    }
    const file = this.file;
    if (file?.dirty && file.editor) await writeDraft(this.draftOf(file)).catch(() => {});
    file?.editor?.release();
    if (this.seats) {
      this.seatUser.stop();
      dropPlace(this.seats, this.seatOwner.place);
      await this.stopInitSeats();
      await this.releaseSeats();
    }
  }

  // 見張り（タブのコピーが POLL_MS おきに。表示していなくても、名乗る前でも動く）。初めての手放しがまだなら受け持ち、開いているタブの
  // どれでもない使う場所と止まった世代の印を外し、窓で POLL_MS に 1 回だけのフォルダの確かめと前の置き場所の片付けをし、自分の使う
  // 場所の無くなった絵の席を書き直してから、手放す絵の席を手放す。1 つずつ動かす。
  async watchSeats(cx) {
    if (this.watchingSeats) return;
    this.watchingSeats = true;
    try {
      await this.initSeats();
      if (this.seats.init.state !== "done") return;
      watch(this.seats, liveViewerTokens(), Date.now());
      await this.seatChores();
      await this.rewriteLostSeats(cx);
      await this.releaseSeats();
    } finally {
      this.watchingSeats = false;
    }
  }

  // 窓で POLL_MS に 1 回だけ（表に最後にした時刻を置き、どれか 1 つのコピーが）: フォルダの一覧を取り、外から消されたフォルダと絵の席の
  // ファイルを作り直す（どこも使っていない絵の席はごく小さい絵で作り、使っている絵の席は使う場所のコピーが書き直す。lib/seats.js の
  // scan）。起動して最初の 1 回だけ、前の置き場所 file-viewer-cache/ の file-viewer の名前の形のファイルを消し、空ならフォルダも消す
  // （mods/ の外なので、消してもメモリは放されない）。
  async seatChores() {
    const table = this.seats, chores = table.chores, now = Date.now();
    if (now - (chores.scanAt ?? 0) < POLL_MS) return;
    chores.scanAt = now;
    const r = scan(table, await listSeats(), this.seatOwner);
    if (r.mkdir) await makeSeatsDir();
    if (r.create.length) released(table, r.create, this.seatOwner, await writeTinySeats(r.create));
    if (!chores.oldCache) {
      chores.oldCache = true;
      const old = await listOldCache();
      if (old) {
        for (const name of oldCacheNames(old)) await removeOldCache(name);
        await removeOldCacheDir();
      }
    }
  }

  // 自分の使う場所の、ファイルが無くなった絵の席を、出していた絵で同じ名前に書き直す（作り直す）。ほかのコピーと共有している絵の席は、
  // 先に受け持ったコピーが書く。図は見え方の決まりにも知らせ、書いて読み込み終えるまで出している結果を出し続ける。画像はコピーし直す。
  // 拡大の窓は出している絵を書き直す。書き直せなかった絵の席は無くなったままになり（lib/seats.js の wrote）、次の回に書き直し直すか、
  // 使う場所が外すと、見張りと手放しがごく小さい絵で作り直すか上書きする。
  async rewriteLostSeats(cx) {
    const user = this.seatUser;
    const mine = user.lostSeats().filter((name) => user.claim(name));
    if (!mine.length) return;
    this.ensureRecord();
    const md = this.md, o = this.overlay;
    if (md) md.lost(mine);
    for (const name of mine) {
      // 書いている間に止まって（表示しなくなった）受け持ちが外れた名前は、書かずに飛ばす（次の見張りの回にまた受け持つ）。
      if (!user.mustWrite(name)) continue;
      try {
        if (o) await this.rewriteOverlaySeat(name, cx);
        else if (name === this.file?.picture && this.file.cache) {
          const r = await copyImage(this.file.path, this.file.machine, name);
          user.wrote(name, { ok: Boolean(r.cache), info: r.cache ? { size: r.size, base: r.base, header64: r.header64 } : null });
        } else await this.rewriteDiagramSeat(md, name, cx);
      } catch {
        if (user.mustWrite(name)) user.wrote(name, { ok: false });
      }
    }
    cx.notify();
  }

  // 見え方の決まりが使っている図のタイル name を、その絵を書いた見た目で書き直す（書いている途中の結果の今の見た目の絵と、
  // 出している前の見た目の絵のどちらも。lib/markdown-state.js の lostTile）。見つからなければ書かない（無くなったままにする）。
  async rewriteDiagramSeat(md, name, cx) {
    const found = md?.lostTile(name);
    if (!found) { this.seatUser.wrote(name, { ok: false }); return; }
    const l = found.part.layout;
    if (found.part.type === "svg") await this.writeSeat(name, () => partSvg(found.part, null, found.file, found.tile), cx);
    else await this.writeSeatTile(found.tile, diagramSvg(l, found.look.colors, { width: l.width, height: l.height }), found.file, l, cx);
    md.wrote(name, Date.now());
    this.awaitPreloads(md, cx);
  }

  // 拡大の窓が使っている絵（出している絵と、書いて読み込みを待っている絵）のタイル name を、その絵の色で書き直す。
  async rewriteOverlaySeat(name, cx) {
    const o = this.overlay, found = o.zs?.lostTile(name);
    if (!found) { this.seatUser.wrote(name, { ok: false }); return; }
    await this.writeSeatTile(found.tile, await this.overlaySvgText(found.colorsKey), { ...found.file, tiles: tilesOf(found.file) }, o.size, cx);
    o.zs.fresh(name);
  }

  // ---- 絵の席（lib/seats.js の表。仕様の「画像の置き場所」） ----

  // その起動で初めて表を作ったとき（か、版の違う表を作り直して POLL_MS たったとき）、フォルダの絵の席を全部ごく小さい絵で上書きして
  // 手放し、初めの数に足りない絵の席を作る（フォルダが無ければ作る）。一度に 1 つのコピーだけがし、ほかのコピーはそれまで絵の席を
  // 割り当てずに待つ。
  async initSeats() {
    const table = this.seats;
    if (table.init.state === "done" || !claimInit(table, this.seatOwner, Date.now())) return;
    this.initingSeats = (async () => {
      try {
        const plan = initPlan(table, await listSeats());
        if (plan.mkdir) await makeSeatsDir();
        initDone(table, this.seatOwner, await writeTinySeats([...plan.overwrite, ...plan.create]));
      } catch {
        // 次の POLL_MS の回にやり直す。
        stopInit(table, this.seatOwner);
      }
    })();
    try {
      await this.initingSeats;
    } finally {
      this.initingSeats = null;
    }
  }

  // 閉じるときに、受け持った初めての手放しを外す。書いている途中なら、書き終わるのを待ってから外す（途中で外すと、ほかのコピーが
  // 受け持って表を作り直し、両方が絵の席に書く）。締め切りまでに終わらなければ、ほかのコピーの見張りの回が STALE_GEN_MS のあとに引き継ぐ。
  async stopInitSeats() {
    if (this.initingSeats) await this.initingSeats;
    stopInit(this.seats, this.seatOwner);
  }

  // 手放す絵の席（どこも使わなくなり、外した使う場所の描画が進んだもの）を、ごく小さい絵で上書きして手放す。上書きできなかった
  // 絵の席は手放し中のまま残り、次の回にもう一度上書きする（lib/seats.js の released。初めての手放し・増やす・作り直しも同じ）。
  // 1 つずつ動かす。
  async releaseSeats() {
    if (!this.seats) return;
    if (this.releasingSeats) { this.releaseSeatsAgain = true; return; }
    this.releasingSeats = true;
    try {
      do {
        this.releaseSeatsAgain = false;
        const names = takeReleases(this.seats, this.seatOwner);
        if (!names.length) break;
        released(this.seats, names, this.seatOwner, await writeTinySeats(names));
      } while (this.releaseSeatsAgain);
    } finally {
      this.releasingSeats = false;
    }
  }

  // 割り当てを待った・絵の席が足りなかったとき（this.seatUser.blocked）。足りなければ増やす数の絵の席をごく小さい絵で作る（ファイルを
  // 作るので、そのとき出している絵は一瞬空白になりうる）。初めての手放しを待つなら、受け持てれば受け持ち、ほかのコピーがしているなら少し待つ。
  // ごく小さい絵で上書きできなかった絵の席を待つなら、手放し直してから少し待つ（上書きが続けて失敗しても回り続けないように）。
  async unblockSeats(cx) {
    const blocked = this.seatUser.blocked;
    this.seatUser.blocked = null;
    if (blocked?.grow) {
      await this.seatUser.grow(blocked.grow, writeTinySeats);
      return;
    }
    if (blocked?.wait === "init") await this.initSeats();
    if (blocked?.wait === "release") await this.releaseSeats();
    if (this.seats.init.state !== "done" || blocked?.wait === "grow" || blocked?.wait === "release") await cx.sleep(100);
  }

  // このコピーの使う場所が今使っている絵の席（names）を表に渡す。外した絵の席があれば、描き直しを求めて、外した描画（か、それが
  // 打ち切られたなら、そのあとの描画）が終わってから（1 秒まで待つ）手放す。来なければ（表示していないなど）POLL_MS の回に任せる。
  trackSeats(cx, names) {
    if (!this.seats) return;
    const place = this.seatOwner.place;
    const before = this.seats.places[place]?.names ?? [];
    this.seatUser.use(names);
    const now = new Set(this.seats.places[place].names);
    if (!before.some((name) => !now.has(name)) || this.awaitingFrame) return;
    this.awaitingFrame = true;
    const frame = this.seats.places[place].frame;
    cx.spawn(async (cx) => {
      try {
        await pauseForApp();
        cx.notify();
        const until = Date.now() + FRAME_WAIT_MS;
        while ((this.seats.places[place]?.frame ?? Infinity) <= frame && Date.now() < until) await cx.sleep(4);
      } finally {
        this.awaitingFrame = false;
      }
      await this.releaseSeats();
    });
  }

  // 本文が使っている絵の席を表に渡す（trackSeats）。図の絵（本文と .mmd）、拡大の窓を開く前に書いている収まる大きさの絵、
  // image viewer の今のコピー・差し替え待ちのコピー・コピーしている途中のコピー。
  trackPictures(cx) {
    const images = [this.file?.picture, this.file?.incoming?.picture, ...this.copying].filter(Boolean);
    this.trackSeats(cx, [...(this.md?.keep() ?? []), ...(this.opening?.file ? tileNames(this.opening.file) : []), ...images]);
  }

  // 図の SVG のタイル 1 枚を絵の席に書く（text: 配置の大きさの SVG。file: 図のファイル全体、layout: 配置の大きさ）。書けなかったら例外。
  async writeSeatTile(tile, text, file, layout, cx) {
    await this.writeSeat(tile.name, () => resizeSvg(text, { width: tile.width, height: tile.height, view: tileView(file, tile, layout) }), cx);
  }

  // 絵の席 name に、make() が返す SVG の全文を書く。ほかのコピーが書く絵の席か、ファイルが無くなって使う場所が書き直す絵の席を
  // 共有したなら、書かずに書き終わるのを待つ。書けなかったら例外。
  async writeSeat(name, make, cx) {
    const user = this.seatUser;
    if (!user.mustWrite(name)) {
      const until = Date.now() + 10_000;
      while (awaiting(this.seats, name) && Date.now() < until) await cx.sleep(50);
      if (seatOf(this.seats, name)?.state !== "ready") throw new Error("共有した図の絵を書き終えなかった");
      return;
    }
    user.writing(name);
    try {
      await writeSeatText(name, make());
      user.wrote(name, { ok: true });
    } catch (e) {
      user.wrote(name, { ok: false });
      throw e;
    }
  }

  // 鍵から絵の席を取って図のファイルを作る（割り当てを待つ間は、待つわけを片付けて取り直す）。fresh: 新しく使い始めた絵の席の知らせ。
  async seatFile(part, look, fresh, cx) {
    for (;;) {
      const file = diagramFile((key) => this.seatUser.nameOf(key, (name) => { this.seatTurns.set(name, (this.seatTurns.get(name) ?? 0) + 1); fresh?.(name); }), part, look);
      if (tileNames(file).every(isSeatName)) return file;
      await this.unblockSeats(cx);
    }
  }

  // 絵を書く前に、自分の token の記録があることを確かめ、無ければ作る（見張りが、記録の無い token の絵を片付けるので）。
  ensureRecord() {
    if (!this.token || record(this.token)) return;
    const file = this.file;
    putRecord(this.token, { space: this.me?.space.id ?? null, machine: file?.machine ?? null, path: file?.path ?? null, preview: false, mode: null, pane: this.pane, createdAt: Date.now() });
  }

  // 自分のペイン・タブ・space。名乗れていなければ null。
  identify() {
    if (!this.token) return null;
    const own = findOwnPane(this.token);
    if (!own) return null;
    const space = spaces().find((s) => s.tabs.some((t) => t.id === own.tab));
    if (!space) return null;
    return { pane: own.pane, tab: own.tab, space, tabInfo: space.tabs.find((t) => t.id === own.tab) };
  }

  // 表示中: そのタブの space が表示中で、そのタブが space の中で選ばれている。
  visible() {
    return Boolean(this.me?.space.active && this.me.tabInfo?.active);
  }

  // タブが表示されなくなったことに、描画ではなくタイマーで気づく（表示していない間は render が呼ばれないので、描画だけでは
  // 隠れたことも戻ったことも分からない。ガイドの「制約」の「表示していない間の部品の状態」）。隠れている間は本文の操作の
  // 知らせ（離れた・離した）が来ないので、本文で覚えている操作の印を解き、戻った最初の描画をタブの表示に戻ったときにする。
  // 隠れたことに気づくのは POLL_MS おきのタイマーの回だけなので、隠れている間にその回が来なかったタブ（POLL_MS より早く戻った
  // タブ）では、印が解けずに残り、戻った最初の描画も戻ったときにならない。次にマウスの知らせが来るまで、スクロールバーが
  // 出たままになったり、押していないのに端の帯で本文の自動スクロールが始まったりすることがある（ガイドの「制約」の
  // 「スクロールバー」）。
  noticeHidden() {
    if (this.visibleNow()) return;
    this.wasVisible = false;
    this.input.reset();
  }

  // 初めて名乗ったとき: 記録を作り（または更新し）、開いたときに選ばれていたタブの右に移る。
  claim(me, cx) {
    const p = props() ?? {};
    const rec = record(this.token);
    const first = !rec || !rec.pane;
    putRecord(this.token, {
      pane: me.pane, space: me.space.id,
      machine: rec?.machine !== undefined ? rec.machine : (p.machine ?? null),
      path: rec?.path ?? (p.path ? normalizePath(p.path) : null),
      preview: rec ? Boolean(rec.preview) : Boolean(p.preview),
      mode: rec?.mode ?? null, dirty: Boolean(rec?.dirty), createdAt: rec?.createdAt ?? Date.now(),
    });
    const started = !this.pane;
    this.pane = me.pane;
    if (first) {
      let index = rec?.index ?? p.index;
      const before = me.space.tabs.find((t) => t.id === this.activeBefore[me.space.id] && t.id !== me.tab);
      if (!index && before) index = before.index + 1;
      if (index && index !== me.tabInfo.index) run("tab.move", { id: me.tab, index });
    }
    if (started) {
      pruneRecords();
      cx.spawn(async () => {
        for (const d of expiredDrafts(await listDrafts(), Date.now())) await deleteDraft(d.name);
      });
    }
    cx.notify();
  }

  // ---- 読み込み ----

  load(target, cx) {
    this.loadedKey = fileKey(target.machine, target.path);
    // 同じファイルを開き直すこと（A → B → A）もあるので、どの読み込みかは鍵ではなく回数で見分ける。
    const gen = this.loads = (this.loads ?? 0) + 1;
    this.md = null;
    this.mdSvg = false;
    this.preparing = null;
    this.mdScroll = new BodyScroll();
    this.file?.editor?.release();
    // 前のファイルの画像のコピーと図の絵は、読み込み中の表示に替えた描画のあとに手放す（trackPictures）。
    this.file = { path: target.path, machine: target.machine ?? null, loading: true };
    cx.spawn(async (cx) => {
      const file = await this.read(target.path, target.machine ?? null, cx);
      this.copying.delete(file.picture);
      // 古い読み込みのコピーは誰も使わないので、描画が来なくても使っている絵の表を更新して手放す（表示していないタブは描画されない）。
      if (this.loads !== gen) { file.editor?.release(); this.trackPictures(cx); return; }
      this.file = file;
      this.setDirty(false);
      cx.notify();
      await this.offerDrafts(file);
      cx.notify();
    });
  }

  // hash: 確かめで分かった今の中身のハッシュ（外部変更で読み直すとき。画像の絵の席を共有するかを決めるのに使う）。
  async read(path, machine, cx, hash = null) {
    const file = { path, machine, loading: false };
    try {
      if (kind({ path, size: 0 }).type === "image") return await this.readImage(file, cx, hash);
      const r = await readText(path, machine);
      if (!r.exists) {
        file.missing = true;
        file.view = { type: "unopenable", reason: "missing" };
        return file;
      }
      file.size = r.size;
      file.view = kind({ path, size: r.size, text: r.text });
      if (file.view.type === "unopenable") { await this.sign(file); return file; }
      this.takeText(file, r.text, await this.notUtf8(r.text, path, machine));
      file.base = r.base;
    } catch (e) {
      file.view = { type: "unopenable", reason: "error", message: message(e) };
      if (e?.size !== undefined) file.size = e.size;
    }
    return file;
  }

  // 開けないファイルの案内のタブは基準（内容のハッシュ）を持たないので、大きさと更新時刻で変化を見る。
  async sign(file) {
    file.sig = await statOf(file.path, file.machine).catch(() => null);
  }

  // 画像は絵の席にコピーして表示する（copyPicture。コピーしている間は使っている絵に入れ、読み込んだ file を採るか捨てるときに外す）。
  // SVG は readSvg。
  async readImage(file, cx, hash = null) {
    if (extension(file.path) === "svg") return this.readSvg(file, cx, hash);
    const r = await this.copyPicture(file, cx, hash);
    if (!r.exists) {
      file.missing = true;
      file.view = { type: "unopenable", reason: "missing" };
      return file;
    }
    file.size = r.size;
    file.view = kind({ path: file.path, size: r.size });
    if (file.view.type === "unopenable") { await this.sign(file); return file; }
    file.cache = r.cache;
    file.base = r.base;
    file.zoom = new Zoom();
    file.dims = imageSize({ bytes: base64ToBytes(r.header64 ?? "") });
    return file;
  }

  // SVG は全文を文字として読み（画像の上限まで）、1 MiB までは Editor にも入れる。画面に出す大きさで書き直したコピーで出す
  // （仕様の「表示の大きさで書き直す」。中身を file.svg に置き、描画で見え方の決まりに渡す。syncSvg）。書かれた大きさが決められない
  // SVG と UTF-8 として読めない SVG は、元のままコピーして出す（routeSvg）。変化の確かめの基準は、1 MiB までは文字のハッシュ、
  // それより大きいものはほかの画像と同じ（readText の基準）。
  async readSvg(file, cx, hash = null) {
    const sig = await statOf(file.path, file.machine);
    const r = sig ? await readText(file.path, file.machine, { limit: IMAGE_LIMIT }) : { exists: false };
    if (!r.exists) {
      file.missing = true;
      file.view = { type: "unopenable", reason: "missing" };
      return file;
    }
    file.size = r.size;
    file.view = kind({ path: file.path, size: r.size });
    if (file.view.type === "unopenable") { await this.sign(file); return file; }
    const readonly = r.utf8 === false || await this.notUtf8(r.text, file.path, file.machine);
    if (file.view.source) this.takeText(file, r.text, readonly);
    file.base = r.base;
    file.zoom = new Zoom();
    await this.routeSvg(file, { text: r.text, size: r.size, mtime: sig.slice(sig.indexOf("|") + 1), hash: r.base.hash, utf8: !readonly }, cx, hash);
    return file;
  }

  // SVG の中身 content（{ text, size, mtime, hash, utf8 }）の出し方を決める（仕様の「表示の大きさで書き直す」）。書き直すもの
  // （app が描けないものも、見え方の決まりが開けない案内にする）は file.svg に中身を置き、元のままコピーするもの（書かれた大きさが
  // 決められない・UTF-8 として読めない）は絵の席にコピーして file.cache に置く（hash は copyPicture と同じ）。寸法は書かれた大きさ。
  async routeSvg(file, content, cx, hash = null) {
    const root = readSvgRoot(content.text);
    file.dims = root.kind === "rewrite" ? { width: root.width, height: root.height } : null;
    if (content.utf8 && root.kind !== "asis") {
      file.svg = { text: content.text, key: svgSource({ machine: file.machine, path: file.path, size: content.size, mtime: content.mtime, hash: content.hash }) };
      file.cache = null;
      file.picture = null;
      return;
    }
    file.svg = null;
    const copy = await this.copyPicture(file, cx, hash);
    file.cache = copy.cache ?? null;
    if (copy.cache) return;
    file.missing = !copy.exists;
    file.view = copy.exists ? kind({ path: file.path, size: copy.size }) : { type: "unopenable", reason: "missing" };
  }

  // 画像を絵の席にコピーする。絵の席は machine・パス・大きさ・更新時刻の鍵で表から取り、同じ鍵の絵があればコピーせずに共有して、
  // コピーしたときに載せた中身の情報（基準のハッシュ・大きさ・先頭のバイト）を使う（ほかのコピーが書いている途中なら書き終わるのを待つ）。
  // 絵の席の名前は file.picture に置き、コピーしている間は使っている絵に入れる（this.copying）。書いた絵は、書いた絵自身の変化の知らせが
  // 済むまで待ってから返す（すぐ出すと、出した絵が捨てられて一瞬空白になる）。hash（確かめで分かった今の中身のハッシュ）を渡したとき、
  // 共有した絵の中身の情報のハッシュがそれと違えば（大きさと更新時刻が同じまま中身だけ変わった）、共有をやめて使っていない絵の席に
  // コピーし直す（鍵の形は変えない。lib/seats.js の unshare）。
  async copyPicture(file, cx, hash = null) {
    const sig = await statOf(file.path, file.machine);
    if (!sig) return { exists: false };
    const [size, mtime] = [Number(sig.split("|")[0]), sig.slice(sig.indexOf("|") + 1)];
    if (size > IMAGE_LIMIT) return { exists: true, size };
    const key = imageKey({ machine: file.machine, path: file.path, size, mtime });
    let seat;
    while (!(seat = this.seatUser.take(key)).name) await this.unblockSeats(cx);
    const name = seat.name;
    file.picture = name;
    this.copying.add(name);
    if (!seat.write) {
      const shared = await this.sharedPicture(name, cx);
      if (!hash || shared.base?.hash === hash) return shared;
      unshare(this.seats, name);
      this.copying.delete(name);
      return this.copyPicture(file, cx);
    }
    this.seatUser.writing(name);
    let r = null;
    try {
      this.ensureRecord();
      r = await copyImage(file.path, file.machine, name);
    } finally {
      const ok = Boolean(r?.cache);
      this.seatUser.wrote(name, { ok, info: ok ? { size: r.size, base: r.base, header64: r.header64 } : null });
    }
    if (r.cache) await cx.sleep(SEAT_SETTLE_MS);
    return r;
  }

  // ほかのタブが書いた（か書いている、書き直している）画像の絵の席を共有する。書き終わるまで待ち、載せた中身の情報で返す。書けなかったら、読み込めなかったことにする。
  async sharedPicture(name, cx) {
    const until = Date.now() + 30_000;
    while (awaiting(this.seats, name) && Date.now() < until) await cx.sleep(50);
    const s = seatOf(this.seats, name);
    if (s?.state !== "ready" || !s.info) throw new Error("画像のコピーを共有できなかった");
    return { exists: true, size: s.info.size, base: s.info.base, cache: `${IMAGES_DIR}/${name}`, header64: s.info.header64 };
  }

  // 新しい画像のコピー（incoming: { picture, cache }）を見えない所で読み込ませ、読み込み終えるまで（読み込めなくても上限まで）待つ。
  // そのあと呼ぶ側が出すコピーを替える（読み込む間に絵が空かないように）。
  async whenImageLoaded(file, incoming, cx) {
    let done;
    const loaded = new Promise((resolve) => { done = resolve; });
    file.incoming = { ...incoming, done };
    cx.notify();
    await Promise.race([loaded, cx.sleep(IMAGE_SWAP_WAIT_MS)]);
    if (file.incoming?.done === done) file.incoming = null;
  }

  // UTF-8 でない（読み取り専用にする）か。読んだ内容に U+FFFD があるときだけファイルのバイト列を確かめ、
  // 正しい UTF-8 なら U+FFFD を文字として含むファイルとして編集させる。確かめられなければ読み取り専用。
  async notUtf8(raw, path, machine) {
    if (!looksNonUtf8(raw)) return false;
    return (await checkUtf8(path, machine).catch(() => null)) !== true;
  }

  // 読んだテキストを file に入れる。先頭の BOM は外して有無だけを記録し、Editor にも「読んだときの内容」
  // （file.text、改行を書き戻す基準）にも BOM 抜きの本文を持つ。
  takeText(file, raw, readonly) {
    const { bom, text } = splitBom(raw);
    file.bom = bom;
    file.text = text;
    file.readonly = readonly;
    this.attachEditor(file, text);
  }

  // Editor を作り、編集の検知をつなぐ。shown は「未編集の内容」。Editor は渡した改行と末尾の改行を
  // そのまま返す（ガイドの「制約」の EditorState）が、編集の有無は Editor から読み戻した値と比べる。
  attachEditor(file, value) {
    const t = theme();
    this.themeKey = themeKey(t);
    const editor = EditorState.new({
      language: languageFor(file.path), value, readonly: Boolean(file.readonly), soft_wrap: this.wrap,
      font_family: settings().font_family, font_size: 13, syntax: syntaxColors(t),
    });
    file.editor = editor;
    file.shown = editor.value();
    editor.on("change", (_e, cx) => {
      if (this.file !== file || file.editor !== editor) return;
      this.setDirty(editor.value() !== file.shown);
      cx.notify();
    });
  }

  // 折り返しやテーマを変えるときは、内容を引き継いで Editor を作り直す（後から変える API が無い）。
  rebuildEditor(cx) {
    const file = this.file;
    if (!file?.editor) return;
    const value = file.editor.value(), shown = file.shown;
    file.editor.release();
    this.attachEditor(file, value);
    file.shown = shown;
    cx.notify();
  }

  // 未保存の編集の有無を記録する。編集したプレビュータブは固定タブになる。
  setDirty(dirty) {
    if (this.file) this.file.dirty = dirty;
    const rec = record(this.token);
    if (!rec) return;
    if (Boolean(rec.dirty) === dirty && !(dirty && rec.preview)) return;
    putRecord(this.token, dirty ? { dirty, preview: false } : { dirty });
  }

  // ディスクの内容で読み直す（未保存の編集は捨てる）。wasMissing は、確認で戻ってきたと分かる前に無かったか。
  // hash: 確かめで分かった今の中身のハッシュ（分かっていれば。read に渡す）。
  reload(cx, wasMissing, hash = null) {
    const file = this.file;
    if (!file) return;
    const missing = wasMissing ?? file.missing;
    const key = this.loadedKey;
    const before = file.editor?.value();
    cx.spawn(async (cx) => {
      const next = await this.read(file.path, file.machine, cx, hash);
      // 読み直したコピーは、採らなければ使っている絵から外れて手放される。
      this.copying.delete(next.picture);
      // 古い読み直しのコピーも、描画が来なくても使っている絵の表を更新して手放す。
      if (this.loadedKey !== key || this.file !== file) { next.editor?.release(); this.trackPictures(cx); return; }
      const outcomeNow = () => reloadOutcome({
        editor: Boolean(file.editor), image: Boolean(file.cache || file.svg), edited: Boolean(file.editor) && file.editor.value() !== before, missing: Boolean(next.missing),
      });
      // 読み込みの間に打った文字は捨てない。読み直さずに、ディスクが変わったことを知らせる。
      // 捨てる読み直しのコピーは、描画が来なくても使っている絵の表を更新して手放す。
      const keepEdits = () => {
        next.editor?.release();
        this.trackPictures(cx);
        if (next.base) this.considerExternal(file, { changed: next.base.hash !== file.base?.hash, diskHash: next.base.hash, dirty: true });
        cx.notify();
      };
      const outcome = outcomeNow();
      // 読み直したらファイルが無かった: 表示していた中身（テキストも画像も）と未保存の編集（と下書き）を残し、「ファイルが無くなった」にする。
      if (outcome === "missing") {
        next.editor?.release();
        file.missing = true;
        file.external = null;
        cx.notify();
        return;
      }
      if (outcome === "keep-edits") { keepEdits(); return; }
      // 画像の中身が変わったら、新しいコピーを読み込み終えてから替える（前のコピーは、替えた描画のあとに手放す）。前が書き直す SVG
      // （file.svg）で、新しい中身が元のままコピーする SVG のときも同じ。読み込みを待つ間に打った文字（SVG のソース表示）も捨てない。
      if (next.cache && (file.cache || file.svg)) {
        this.copying.add(next.picture);
        await this.whenImageLoaded(file, { picture: next.picture, cache: next.cache }, cx);
        this.copying.delete(next.picture);
        if (this.loadedKey !== key || this.file !== file) { next.editor?.release(); this.trackPictures(cx); return; }
        if (outcomeNow() === "keep-edits") { keepEdits(); return; }
      }
      file.editor?.release();
      carryOver(file, next);
      this.file = next;
      this.setDirty(false);
      cx.notify();
      // 捨てた編集の下書きも消す（新しい file は下書きを持っていないので、keepDraft では消えない）。
      if (file.dirty || file.drafted !== undefined) await deleteDraft(this.draftNameOf(file));
      // 無くなっていたファイルが戻ってきたら、そのファイルの下書きをもう一度聞く。
      if (missing && !next.missing) { await this.offerDrafts(next); cx.notify(); }
    });
  }

  // ---- 下書き ----

  // 今の編集の下書きの名前。読み込んだ file ごとに印を付け、復元を聞いている自分の token の下書き
  // （再起動の前の編集など）と別のファイルにする。同じ名前だと、答える前の編集がそれを上書きし、
  // 保存や「破棄」で両方が消える。
  draftNameOf(file) {
    file.draftName ??= draftName(this.token, file.machine, file.path, randomUUID());
    return file.draftName;
  }

  draftOf(file) {
    return {
      name: this.draftNameOf(file),
      token: this.token, machine: file.machine, path: file.path,
      content: file.editor.value(), bom: Boolean(file.bom), base: file.base ?? null, updatedAt: Date.now(),
    };
  }

  // 編集している間、3 秒ごとに下書きを更新する。編集が無くなったら自分の下書きを消す。
  keepDraft(cx) {
    const file = this.file;
    if (!file?.editor || file.loading) return;
    if (file.dirty) {
      const content = file.editor.value();
      if (content === file.drafted) return;
      file.drafted = content;
      cx.spawn(async () => { await writeDraft(this.draftOf(file)).catch(() => { file.drafted = null; }); });
    } else if (file.drafted !== undefined) {
      file.drafted = undefined;
      cx.spawn(async () => deleteDraft(this.draftNameOf(file)));
    }
  }

  // 開いたファイルに、開いているほかの viewer のタブのものでない下書きがあれば「復元 / 破棄」を聞く。
  // ファイルが無いとき（無くなった後の再起動など）も、そのファイルの下書きがあれば聞く。
  async offerDrafts(file) {
    if (!offersDrafts(file)) return;
    const list = draftsFor({ drafts: await listDrafts(), machine: file.machine, path: file.path, openTokens: openTokens(), selfToken: this.token });
    if (this.file !== file || !list.length) return;
    file.drafts = list;
  }

  restoreDraft(name, cx) {
    const file = this.file;
    const draft = file?.drafts?.find((d) => d.name === name);
    if (!draft || (!file.editor && !file.missing)) return;
    const { text, bom } = restoredDraft(draft);
    if (!file.editor) {
      // ファイルが無いときは、下書きの内容を入れる Editor を作る。未保存の編集として入れるため空で作る。
      // 改行と末尾の改行・BOM の有無は下書きのものを保つ。SVG は画像のコピーが無いので、ソースとして出す。
      const view = kind({ path: file.path, size: 0, text });
      file.view = view.type === "image" ? { type: "code", source: true } : view;
      file.text = text;
      file.bom = bom;
      this.attachEditor(file, "");
    }
    file.drafts = file.drafts.filter((d) => d !== draft);
    file.editor.set_value(text);
    // 復元は編集として扱う（プレビュータブなら固定タブになる）。保存前の確認の基準は下書きに記録したディスクの状態。
    file.base = draft.base;
    this.setDirty(file.editor.value() !== file.shown);
    file.drafted = null;
    // 復元のあとのディスクの確認が返るまでは、外部変更を知らせない（2 秒ごとの確認と同じ変化を 2 回知らせないため）。
    // 出ていた外部変更の知らせは、復元する前の基準からの変化なので消す。
    file.restoring = true;
    file.external = null;
    cx.spawn(async (cx) => {
      await deleteDraft(draft.name);
      const r = await checkChanged(file.path, file.machine, draft.base).catch(() => null);
      file.restoring = false;
      if (this.file === file && r && (r.missing || r.changed)) {
        // 知らせた変化は、外部変更としては知らせない（そこからさらに変わったら知らせる）。選択を待つ知らせが出ていれば、
        // それを残す（保存前の確認がその変化を示している）。
        if (showsDraftChanged(file.notice?.kind ?? null)) file.notice = { kind: "draft-changed" };
        file.draftNoticed = r.base?.hash ?? null;
      }
      cx.notify();
    });
    cx.notify();
  }

  discardDraft(name, cx) {
    const file = this.file;
    const draft = file?.drafts?.find((d) => d.name === name);
    if (!draft) return;
    file.drafts = file.drafts.filter((d) => d !== draft);
    cx.spawn(async (cx) => { await deleteDraft(draft.name); cx.notify(); });
    cx.notify();
  }

  // ---- 外部変更 ----

  poll(cx) {
    const file = this.file;
    if (!file || file.loading || file.polling || file.saving || !this.visible()) return;
    if (file.view?.type === "unopenable" && file.view.reason !== "missing") { this.pollUnopenable(file, cx); return; }
    if (!file.base && !file.missing) return;
    file.polling = true;
    const key = this.loadedKey, base = file.base;
    cx.spawn(async (cx) => {
      try {
        // 開いたときに無かった画像は基準が無いので、画像として確かめる。
        const r = await checkChanged(file.path, file.machine, base, { bytes: !file.editor && kind({ path: file.path, size: 0 }).type === "image" });
        // 確認の間に保存が始まった・終わったなら、この結果は古い。
        if (this.loadedKey !== key || this.file !== file || file.saving || file.base !== base) return;
        if (r.missing) {
          if (!file.missing) { file.missing = true; cx.notify(); }
          return;
        }
        const back = file.missing;
        file.missing = false;
        if (!r.changed) { if (back) cx.notify(); return; }
        // 画像のバイト列のハッシュで確かめたとき（Editor の無い画像）は、そのハッシュで、共有する絵の席の中身を確かめさせる。
        if (this.considerExternal(file, { changed: true, diskHash: r.base.hash }) === "reload") { this.reload(cx, back, file.editor ? null : r.base.hash); return; }
        cx.notify();
      } catch {
        // 一時的な失敗（machine に届かない等）は次の確認で取り直す。
      } finally {
        file.polling = false;
      }
    });
  }

  // 開けないファイルの案内（上限超え・バイナリ・読み込みの失敗）のタブ。変わったか、前回が読み込みの失敗なら読み直す。
  pollUnopenable(file, cx) {
    file.polling = true;
    cx.spawn(async (cx) => {
      try {
        const sig = await statOf(file.path, file.machine);
        if (this.file !== file) return;
        if (file.view.reason === "error" || sig !== file.sig) this.reload(cx);
      } catch {
        // machine に届かない等は次の確認で取り直す。
      } finally {
        file.polling = false;
      }
    });
  }

  // ---- 保存 ----

  onKey(e, cx) {
    const k = e.keystroke;
    if (k === "ctrl-s" || k === "cmd-s") {
      cx.stop_propagation();
      this.save(cx);
    }
  }

  save(cx) {
    const file = this.file;
    if (!file?.editor || file.readonly || file.saving) return;
    if (file.missing) {
      this.openChoice(file, { kind: "recreate" });
      cx.notify();
      return;
    }
    if (!file.dirty) return;
    file.saving = true;
    cx.spawn(async (cx) => {
      try {
        const r = await checkChanged(file.path, file.machine, file.base);
        if (r.missing) { file.missing = true; this.openChoice(file, { kind: "recreate" }); return; }
        if (r.changed) { this.openChoice(file, { kind: "conflict", base: r.base }); return; }
        await this.write(file, file.base, cx);
      } catch (e) {
        file.notice = { kind: "error", text: `保存できなかった: ${message(e)}` };
      } finally {
        file.saving = false;
        cx.notify();
      }
    });
  }

  // base を基準に書く（null ならファイルを作る）。食い違えば確認に戻す。
  // 書いている間（他 machine では exec を何度も往復する）にも編集できるので、書いた内容を基準にし、
  // それより新しい編集は未保存のまま残す。cx: SVG の画像を取り直すときの描き直しに使う。
  async write(file, base, cx) {
    const value = file.editor.value();
    const content = contentToSave({ original: file.text ?? "", edited: value, bom: Boolean(file.bom) });
    try {
      file.base = await writeText(file.path, file.machine, content, base);
    } catch (e) {
      if (!(e instanceof WriteConflict)) throw e;
      if (e.reason === "missing") { file.missing = true; this.openChoice(file, { kind: "recreate" }); }
      else this.openChoice(file, { kind: "conflict", base: null });
      return;
    }
    file.text = splitBom(content).text;
    file.shown = value;
    file.missing = false;
    file.notice = null;
    file.external = null;
    file.dismissed = null;
    file.draftNoticed = null;
    const dirty = file.editor.value() !== value;
    this.setDirty(dirty);
    if (dirty) {
      // 下書きは残し、次の更新で新しい基準のものに書き直す。
      file.drafted = null;
    } else {
      // 保存したら、このタブの下書きは消す。
      file.drafted = undefined;
      await deleteDraft(this.draftNameOf(file));
    }
    if (file.view?.type === "image" && extension(file.path) === "svg") await this.resaved(file, content, cx);
  }

  // SVG のソースを保存したら、画像表示も保存した中身（content）にする。書き直す SVG は中身を見え方の決まりに渡し（画像表示に
  // 戻ったときに、今の倍率のまま書いて差し替える。syncSvg）、元のままコピーする SVG は新しい名前でコピーし直し、読み込み終えてから
  // 替える（前のコピーは手放す）。保存した中身は Editor から書いたので UTF-8。
  async resaved(file, content, cx) {
    const sig = await statOf(file.path, file.machine).catch(() => null);
    if (this.file !== file) return;
    if (readSvgRoot(content).kind !== "asis" && sig) {
      const size = Number(sig.split("|")[0]), mtime = sig.slice(sig.indexOf("|") + 1);
      await this.routeSvg(file, { text: content, size, mtime, hash: file.base.hash, utf8: true }, cx);
      return;
    }
    const incoming = { path: file.path, machine: file.machine };
    const r = await this.copyPicture(incoming, cx).catch(() => null);
    if (r?.cache && this.file === file) await this.whenImageLoaded(file, { picture: incoming.picture, cache: r.cache }, cx);
    this.copying.delete(incoming.picture);
    if (r?.cache && this.file === file) {
      file.cache = r.cache;
      file.picture = incoming.picture;
      file.svg = null;
      file.dims = imageSize({ svg: content });
    }
  }

  // 外部変更の知らせを、ほかの知らせとの重なりの規則（lib/notices.js）で出す・置き換える・消す。
  // 戻り値が "reload" なら（未編集のタブ）、呼ぶ側が読み直す。
  considerExternal(file, { changed, diskHash, dirty = Boolean(file.dirty) }) {
    const action = externalNoticeAction({
      dirty, changed, diskHash, notice: file.notice?.kind ?? null, external: file.external?.hash ?? null,
      dismissed: file.dismissed ?? null, draftNoticed: file.draftNoticed ?? null, restoring: Boolean(file.restoring),
    });
    if (action === "show" || action === "update") file.external = { hash: diskHash };
    if (action === "hide") file.external = null;
    return action;
  }

  // 選択を待つ知らせ（保存前の確認の 3 択、作り直す確認）を出す。出ていた外部変更の知らせはこれに置き換わる。
  openChoice(file, notice) {
    file.notice = notice;
    this.considerExternal(file, { changed: true, diskHash: notice.base?.hash ?? null, dirty: true });
  }

  // 外部変更の知らせの答え。
  answerExternal(choice, cx) {
    const file = this.file;
    const external = file?.external;
    if (!external) return;
    file.external = null;
    if (choice === "reload") { this.reload(cx); return; }
    // 自分の編集を続ける: 同じ変化はもう知らせない。
    file.dismissed = external.hash;
    cx.notify();
  }

  // 外部変更の知らせ以外の確認の答え。
  answer(choice, cx) {
    const file = this.file;
    const notice = file?.notice;
    if (!notice) return;
    file.notice = null;
    if (choice === "reload") { this.reload(cx); return; }
    if (choice === "cancel" || choice === "close") { cx.notify(); return; }
    // overwrite（今のディスクの内容を基準にして上書き）/ recreate（作り直す）
    file.saving = true;
    cx.spawn(async (cx) => {
      try {
        let base = null;
        if (choice === "overwrite") {
          base = notice.base;
          if (!base) {
            const r = await checkChanged(file.path, file.machine, null);
            if (r.missing) { file.missing = true; this.openChoice(file, { kind: "recreate" }); return; }
            base = r.base;
          }
        }
        await this.write(file, base, cx);
      } catch (e) {
        file.notice = { kind: "error", text: `保存できなかった: ${message(e)}` };
      } finally {
        file.saving = false;
        cx.notify();
      }
    });
  }

  // ---- 表示 ----

  syncTitle(me) {
    const title = tabTitles(viewerTabsIn(me.space.id))[this.token];
    if (!title || title === me.tabInfo.name || title === this.pendingTitle) return;
    this.pendingTitle = title;
    run("tab.rename", { id: me.tab, name: title });
  }

  // 描画の回数（lib/seats.js の rendered）は、描画の木を組み立て終えてから進める。打ち切られた描画（interrupted）は戻らないので
  // 数えない（app は前に描けた画面を出し続けるので、その画面が出している前の絵の席を、回数が進んだことにして手放さないように）。
  render(cx) {
    const t = theme();
    const tree = this.overlay ? this.renderOverlay(t, cx) : this.renderTab(t, cx);
    if (this.seats) rendered(this.seats, this.seatOwner.place);
    return tree;
  }

  renderTab(t, cx) {
    const me = this.identify();
    this.me = me;
    if (me && this.pane !== me.pane && this.claiming !== me.pane) {
      this.claiming = me.pane;
      cx.spawn(async (cx) => this.claim(me, cx));
    }
    const rec = this.token ? record(this.token) : null;
    if (me && rec?.pane === me.pane) {
      const path = rec.path ?? props()?.path ?? null;
      if (path && fileKey(rec.machine, path) !== this.loadedKey) {
        const target = { machine: rec.machine ?? null, path };
        this.loadedKey = fileKey(target.machine, path);
        cx.spawn(async (cx) => this.load(target, cx));
      }
      cx.spawn(async () => this.syncTitle(me));
    }
    if (this.file?.editor && this.themeKey !== themeKey(t) && !this.rebuilding) {
      // spawn の中身は最初の await まで描画の中で動く（ガイドの「cx.spawn の始まり」）。Editor の作り直しと cx.notify() は
      // 描画の中ではできないので、先に区切る。
      this.rebuilding = true;
      cx.spawn(async (cx) => {
        await pauseForApp();
        this.rebuilding = false;
        this.rebuildEditor(cx);
      });
    }
    const shownNow = this.visible();
    const returned = shownNow && !this.wasVisible;
    this.wasVisible = shownNow;
    this.syncMarkdown(rec, t, cx);
    this.syncSvg(rec, cx);
    this.trackPictures(cx);

    return v_flex().id("fv-root").relative().size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .track_focus(this.focus).on_key_down((e, cx) => this.onKey(e, cx))
      .child(this.toolbar(rec, t))
      .children(this.notices(t))
      .child(this.body(rec, t, cx, returned))
      .children(this.preloads());
  }

  toolbar(rec, t) {
    const file = this.file;
    const type = file?.view?.type;
    const source = this.showsSource(rec);
    const md = type === "markdown" ? this.md?.display() : null;
    const isCode = type === "code" || ((type === "markdown" || type === "image" || type === "mermaid") && source && file?.editor);
    // 書き直す SVG を開けなかったとき（開けない案内）は、寸法とズームを出さない。
    const isImage = type === "image" && !source && this.svgView()?.kind !== "error";
    return h_flex().id("fv-toolbar").h(34).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(file?.path ?? ""))
      .when(Boolean(rec?.preview), (el) => el.child(button("fv-pin", "固定", t, (cx) => { putRecord(this.token, { preview: false }); cx.notify(); })))
      .when(isImage, (el) => el.child(div().flex_none().text_size(12).text_color(t.muted).child(imageInfo(file))))
      .when(isImage, (el) => el.child(zoomTools({ id: "fv-zoom", zoom: file.zoom, width: file.dims?.width ?? 512, height: file.dims?.height ?? 512, t })))
      // 整形表示の上限を超えている間は、整形表示に切り替えるボタンを出さない。
      .when(type === "markdown" && (!source || Boolean(md?.formatButton)), (el) => el.child(button("fv-source", source ? "整形表示" : "ソース", t, (cx) => this.toggleSource(cx), source)))
      .when(type === "mermaid" && !source && Boolean(file?.editor), (el) => {
        const l = this.mmdLayout();
        return l && file.zoom ? el.child(zoomTools({ id: "fv-mmd-zoom", zoom: file.zoom, width: l.width, height: l.height, t })) : el;
      })
      .when(type === "mermaid", (el) => el.child(button("fv-source", source ? "図" : "ソース", t, (cx) => this.toggleSource(cx), source)))
      .when(type === "image" && Boolean(file?.view?.source), (el) => el.child(button("fv-source", source ? "画像" : "ソース", t, (cx) => this.toggleSource(cx), source)))
      .when(isCode, (el) => el.child(button("fv-wrap", "折り返し", t, (cx) => { this.wrap = !this.wrap; this.rebuildEditor(cx); }, this.wrap)))
      .when(Boolean(file?.editor && !file.readonly), (el) => el.child(button("fv-save", file.dirty ? "保存 ●" : "保存", t, (cx) => this.save(cx))));
  }

  banner(id, text, t, color, actions = [], onAnswer = (key, cx) => this.answer(key, cx)) {
    return h_flex().id(id).flex_none().px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.raised)
      .child(div().w(3).h(16).flex_none().rounded(2).bg(color))
      .child(div().flex_1().min_w(0).text_size(12).child(text))
      .children(actions.map(([key, label]) => button(`${id}-${key}`, label, t, (cx) => onAnswer(key, cx))));
  }

  notices(t) {
    const file = this.file;
    if (!file || file.loading) return [];
    const out = [];
    if (file.missing && file.view?.type !== "unopenable") out.push(this.banner("fv-missing", "ファイルが無くなった（表示は無くなる前の内容）", t, t.blocked));
    if (file.readonly) out.push(this.banner("fv-encoding", "UTF-8 でない可能性があるため、読み取り専用で開いている（文字化けしている部分がある）", t, t.blocked));
    const n = file.notice;
    // 外部変更の知らせは、知らせるだけのものや「復元 / 破棄」と並べて出す（重なりの規則は considerExternal）。
    if (file.external) out.push(this.banner("fv-external", "ディスクの内容が変わった", t, t.working, [["reload", "ディスクの内容で読み直す"], ["keep", "自分の編集を続ける"]], (key, cx) => this.answerExternal(key, cx)));
    if (n?.kind === "conflict") out.push(this.banner("fv-conflict", "保存の前にディスクの内容が変わっている", t, t.blocked, [["reload", "ディスクの内容で読み直す"], ["overwrite", "自分の内容で上書きする"], ["cancel", "やめる"]]));
    if (n?.kind === "recreate") out.push(this.banner("fv-recreate", "ファイルが無くなっている。今の内容で作り直す？", t, t.blocked, [["recreate", "作り直す"], ["cancel", "やめる"]]));
    if (n?.kind === "error") out.push(this.banner("fv-error", n.text, t, t.blocked, [["close", "閉じる"]]));
    if (n?.kind === "draft-changed") out.push(this.banner("fv-draft-changed", "下書きの後にディスクが変わっている（保存するときに確かめる）", t, t.working, [["close", "閉じる"]]));
    // 整形表示の知らせ（知らせるだけのもの。閉じられない）。
    const shownNotices = !this.md ? [] : file.view?.type === "markdown" ? this.md.display().notices
      : file.view?.type === "mermaid" && this.md.display().kind !== "source" ? diagramFileView(this.md.display()).notices : [];
    for (const [i, m] of shownNotices.entries()) {
      out.push(this.banner(`fv-md-notice-${i}`, markdownNotice(m), t, m.kind === "over" ? t.working : t.blocked));
    }
    // 書き直した SVG の書き直しの失敗（知らせるだけのもの。画像表示のときだけ出し、次に書けたら消える）。
    const svg = file.view?.type === "image" && !(this.showsSource(record(this.token)) && file.editor) ? this.svgView() : null;
    for (const [i, m] of (svg?.notices ?? []).entries()) out.push(this.banner(`fv-svg-notice-${i}`, svgNotice(m), t, t.blocked));
    for (const [i, d] of (file.drafts ?? []).entries()) {
      out.push(h_flex().id(`fv-draft-${i}`).flex_none().px(12).py(6).gap(8).items_center().border_b(1).border_color(t.border).bg(t.raised)
        .child(div().w(3).h(16).flex_none().rounded(2).bg(t.accent))
        .child(div().flex_1().min_w(0).text_size(12).child(`未保存の編集の下書きがある（${when(d.updatedAt)}）`))
        .child(button(`fv-draft-${i}-restore`, "復元", t, (cx) => this.restoreDraft(d.name, cx)))
        .child(button(`fv-draft-${i}-discard`, "破棄", t, (cx) => this.discardDraft(d.name, cx))));
    }
    return out;
  }

  // 表示の切り替え（整形 / ソース）はタブごとに記録に持つ。既定は整形表示。Markdown は、整形表示の上限で移した
  // ソース表示も含めて、見え方の決まり（this.md）に従う（記録には利用者が選んだものだけを書く）。
  showsSource(rec) {
    if (this.preparedType() && this.md) return this.md.display().kind === "source";
    return rec?.mode === "source";
  }

  toggleSource(cx) {
    const md = this.preparedType() ? this.md : null;
    if (md) {
      if (md.display().kind === "source") {
        md.enter();
      } else md.toSource();
      putRecord(this.token, { mode: md.userSource ? "source" : null });
    } else {
      putRecord(this.token, { mode: this.showsSource(record(this.token)) ? null : "source" });
    }
    cx.notify();
  }

  // ---- Markdown の整形の準備 ----

  // 描画のたびに、Markdown の今の内容を見え方の決まりに渡す（開いたとき・中身が変わったとき）。描画の中で済む大きさなら、
  // ここで整形の準備を終える（前の描画がその準備の途中で打ち切られていたら、描画の外に移す）。描画の外で準備するものがあれば、
  // 区切りながら進める。
  // .mmd も同じ決まり（lib/mmd.js）で、ファイル全体を図 1 つの文書として準備する。
  syncMarkdown(rec, t, cx) {
    const file = this.file;
    const type = this.preparedType();
    if (!type || file.loading || !file.editor) return;
    const text = file.editor.value();
    const look = type === "markdown" ? this.bodyLook(t) : this.mmdLook(t);
    if (!this.md) {
      // 図の絵は絵の席に書く。名前は絵の席の表から取り、このタブが新しく使い始めた絵の席は、書いた・読み込んだことを忘れさせる
      // （手放したあとに同じ絵の席が別の絵に使われるので）。
      let md = null;
      const fileOf = (part, look) => diagramFile((key) => this.seatUser.nameOf(key, (name) => this.freshSeat(md, name)), part, look);
      md = this.md = type === "markdown" ? new MarkdownState({ fileOf, preloadWait: SEAT_SETTLE_MS }) : diagramFileState({ fileOf, preloadWait: SEAT_SETTLE_MS });
      this.md.setLook(look);
      this.md.open(text, { userSource: rec?.mode === "source" });
    } else {
      this.md.setLook(look);
      this.md.sync(text);
    }
    if (this.md.needsRun && !this.preparing && this.visible()) this.runPreparation(cx);
  }

  freshSeat(md, name) {
    md?.fresh(name);
    this.seatTurns.set(name, (this.seatTurns.get(name) ?? 0) + 1);
  }

  // 描画のたびに、書き直す SVG の今の中身（file.svg）と見た目（倍率か枠に収める倍率）を見え方の決まり（lib/svg-file.js）に渡し、
  // 書くものがあれば描画の外で進める（.mmd と同じ。syncMarkdown）。ソース表示の間は渡さず、画像表示に戻ったときに今の中身で書き直す。
  // 元のままコピーする SVG（file.svg が無い）に替わったら、見え方の決まりを捨てる（その絵の席は使っている絵から外れて手放される）。
  // 走っている準備のループも止める（捨てた決まりの絵を書き続けないように）。
  syncSvg(rec, cx) {
    const file = this.file;
    if (!file || file.loading || !file.svg) {
      if (this.mdSvg) { this.md = null; this.mdSvg = false; this.preparing = null; }
      return;
    }
    if (this.showsSource(rec) && file.editor) return;
    // 図と同じく、書く面積（とタイルの数）の上限に収まる倍率までにする（元のままコピーするコピーから替わったときも）。
    file.zoom.maxScale = svgMaxScale;
    const viewport = window.viewport_size();
    const look = svgLook(file.zoom, file.dims ?? { width: 1, height: 1 }, { width: viewport.width, height: viewport.height });
    if (!this.mdSvg || !this.md) {
      let md = null;
      const fileOf = (part, look) => diagramFile((key) => this.seatUser.nameOf(key, (name) => this.freshSeat(md, name)), part, look);
      md = this.md = svgFileState({ fileOf, preloadWait: SEAT_SETTLE_MS });
      this.mdSvg = true;
      md.setLook(look);
      md.open(file.svg);
    } else {
      this.md.setLook(look);
      this.md.sync(file.svg);
    }
    if (this.md.needsRun && !this.preparing && this.visible()) this.runPreparation(cx);
  }

  // 書き直す SVG のタブがソース表示を出しているか（その間は書き直さない。syncSvg・runPreparation・watchPreparation）。
  svgSourceShown() {
    return Boolean(this.mdSvg && this.file?.editor && this.showsSource(record(this.token)));
  }

  // 書き直す SVG の出し方（lib/svg-file.js の svgFileView）。書き直す SVG でなければ null。
  svgView() {
    return this.file?.svg && this.mdSvg && this.md ? svgFileView(this.md.display()) : null;
  }

  // 整形の準備の決まり（this.md）で出すファイルの種類（"markdown" | "mermaid"）。ほかは null。
  preparedType() {
    const type = this.file?.view?.type;
    return type === "markdown" || type === "mermaid" ? type : null;
  }

  // .mmd の図の見た目（テーマの色と、今の倍率。枠に収める倍率なら枠の大きさ）。枠の大きさがまだ分からなければ、窓の描ける大きさで見積もる。
  mmdLook(t) {
    const zoom = this.file.zoom ??= diagramZoom();
    const colors = diagramColors(t);
    if (!zoom.fit) return scaleLook(colors, zoom.scale);
    const view = zoom.view ?? { width: window.viewport_size().width, height: window.viewport_size().height };
    return fitLook(colors, { width: view.width, height: view.height, max: zoom.fitMax });
  }

  // .mmd の図の配置（準備中の中身か、出している中身のもの）。まだ無ければ null。
  mmdLayout() {
    const part = (this.md?.job?.parts ?? this.md?.shown?.parts)?.[0];
    return part?.layout ?? null;
  }

  // 本文の図の見た目（テーマの色と本文の幅）。本文の幅がまだ分からなければ、窓の描ける大きさから見積もる。
  bodyLook(t) {
    const width = bodyWidth(this.mdBox) ?? Math.max(120, window.viewport_size().width - 48);
    return bodyLook(diagramColors(t), width);
  }

  // 描画の外の整形の準備を、1 区間ずつ入出力の await で区切って進める。区間ごとに自分のタブを表示しているかを取り直し
  // （this.me は描画の中でしか取り直さない）、表示していなければ止める（表示に戻った描画で続きを始める）。止めるときは、書き始めていない
  // 絵の席の書く印と、始めていない絵の席を増やす受け持ちを外す（同じ図を共有した表示しているタブが、書かれない絵の席を待たないように。
  // 戻ったら名前を取り直して書く）。
  // 描き直しは、出すものが変わったときだけ求める（大きな整形表示の描き直しは重い。ガイドの「制約」）。
  // 印を外されたら（読み込み直した、見張りが手放した）、その非同期処理は進めずに終える。
  runPreparation(cx) {
    const md = this.md;
    const run = this.preparing = {};
    cx.spawn(async (cx) => {
      let notified = Date.now();
      try {
        while (this.preparing === run && md.needsRun) {
          // spawn の中身は最初の await まで、呼んだ描画の中で動き、そこでの cx.notify() は例外になる（ガイドの「制約」）ので、
          // 区間の前に区切る。
          await pauseForApp();
          if (this.preparing !== run || !md.needsRun) break;
          const me = this.identify();
          if (!(me?.space.active && me.tabInfo?.active)) { md.pause(); this.seatUser?.stop(); break; }
          // 書き直す SVG は、ソース表示の間は次の書き込みを始めない（始めていた分は書き終えている）。止め方は表示していないときと同じで、
          // 画像表示に戻った描画（syncSvg）で続きを始める。
          if (this.md === md && this.svgSourceShown()) { md.pause(); this.seatUser?.stop(); break; }
          const shown = md.shown, failure = md.failure;
          const task = md.writeTask();
          if (task) await this.writeSvg(md, task, cx);
          else md.tick(PREPARE_SLICE_MS, Date.now);
          // 書いた SVG を読み込ませる（見えない所に置く）ための描き直しは、書き終えたときと、書く間はときどきにする（大きな整形表示の
          // 描き直しは重い）。
          const written = task && (!md.writeTask() || Date.now() - notified > 250);
          if (md.shown !== shown || md.failure !== failure || written) {
            notified = Date.now();
            cx.notify();
          }
          if (task) this.awaitPreloads(md, cx);
        }
      } finally {
        if (this.preparing === run) this.preparing = null;
      }
    });
  }

  // 書いた絵を見えない所で読み込ませてよくなる時刻（書き終えてから SEAT_SETTLE_MS）に描き直す。
  awaitPreloads(md, cx) {
    if (this.preloadTimer === md || md.preloadDue(Date.now()) === null) return;
    this.preloadTimer = md;
    cx.spawn(async (cx) => {
      try {
        for (let due; this.md === md && (due = md.preloadDue(Date.now())) !== null;) {
          await cx.sleep(Math.max(1, due - Date.now()));
          if (this.md === md) cx.notify();
        }
      } finally {
        if (this.preloadTimer === md) this.preloadTimer = null;
      }
    });
  }

  // 書いた図の SVG を見えない所で読み込ませる要素の並び。整形表示だけでなく、ソース表示や .mmd の描けない図の表示の間も
  // 描画の木に置く（準備や書き直しは表示を切り替えても続き、読み込みの知らせが来ないと 10 秒で終わらなかったことになる）。
  // 位置を取らない 1 px の枠なので、どの表示にも見える物を足さない。
  preloads() {
    return [this.md && this.preloadsOf(this.md), this.openingPreload(), this.imagePreload()].filter(Boolean);
  }

  // 画像の中身が変わって新しいコピーに替える前に、新しいコピーを見えない所で読み込ませる要素。無ければ null。
  imagePreload() {
    const incoming = this.file?.incoming;
    if (!incoming) return null;
    return preloadImages({ id: "fv-image-preload", files: [{ name: incoming.picture, path: incoming.cache }], onLoaded: () => incoming.done() });
  }

  // 書いたがまだ読み込んでいない図の SVG を、見えない所で読み込ませる要素。無ければ null。要素の id には、その絵の席を新しく
  // 使い始めた回数を入れる（前に同じ絵の席で読み込んだ要素と分ける）。
  preloadsOf(md) {
    const files = md.preloads(Date.now()).map((f) => ({ ...f, id: `${f.name}.${this.seatTurns?.get(f.name) ?? 0}` }));
    if (!files.length) return null;
    return preloadImages({ id: "fv-preload", files, onLoaded: (name, cx) => { if (md.loadedImage(name, Date.now())) cx.notify(); } });
  }

  // 図の SVG（タイル 1 枚）を絵の席に書く。書く間の時間も、準備を動かしている時間に数える。書く前に、自分の記録があることを確かめる
  // （無ければ作る。記録の無いタブの使う場所は、ほかのタブの見張りが外すので）。
  // 絵の席の割り当てを待っていた（仮の名前）なら、待つわけを片付けてから名前を取り直す。ほかのコピーが書く絵の席か、ファイルが
  // 無くなって使う場所が書き直す絵の席を共有したなら、書き終わるのを待つ（その絵の席の鍵が外れたら、名前を取り直す）。
  async writeSvg(md, task, cx) {
    const name = task.name, user = this.seatUser;
    if (!isSeatName(name)) {
      await this.unblockSeats(cx);
      md.refresh();
      return;
    }
    if (!user.mustWrite(name)) {
      const key = seatOf(this.seats, name)?.key;
      const until = Date.now() + 10_000;
      while (awaiting(this.seats, name) && seatOf(this.seats, name).key === key && Date.now() < until) await cx.sleep(50);
      const seat = seatOf(this.seats, name);
      if (seat?.state === "ready" && seat.key === key) md.wrote(name, Date.now());
      else md.refresh();
      return;
    }
    user.writing(name);
    try {
      this.ensureRecord();
      await writeSeatText(name, partSvg(task.part, md.look.colors, task.file, task));
      user.wrote(name, { ok: true });
      md.wrote(name, Date.now());
    } catch (e) {
      user.wrote(name, { ok: false });
      md.writeFailed(name, message(e), Date.now());
    }
  }

  // 描画の外の準備の区間が戻らないまま止まっていないか、描画の中の準備が打ち切られたままでないかを見張る（lib/markdown-state.js の
  // watch）。止まっても打ち切られても描き直しが起きるとは限らないので、描画ではなくタイマーから見る。止まった非同期処理の finally が
  // 動いて印が外れていても見られるよう、印の有無では絞らない。手放したら、描き直しで代わりの整形表示を出すか、次の準備を始める。
  // 書き直す SVG のソース表示の間は、表示していないときと同じく 10 秒を数えない（その間は書き直さないので）。
  watchPreparation(cx) {
    if (!this.md?.watched) return;
    const me = this.identify();
    if (!this.md.watch(Date.now, Boolean(me?.space.active && me.tabInfo?.active) && !this.svgSourceShown())) return;
    this.preparing = null;
    cx.spawn(async (cx) => {
      await pauseForApp();
      cx.notify();
    });
  }

  // 整形表示のリンク。http(s) はブラウザ、ほかのファイルは viewer のタブ（プレビュー）で開く。
  followLink(url, cx) {
    const file = this.file;
    if (!file) return;
    const target = resolveLink({ from: file.path, href: url });
    if (target.type === "external") { cx.open_url(target.url); return; }
    if (target.type !== "file") return;
    cx.spawn(async () => {
      // 何があるかだけを、中身を読まずに見る（テキストとして読むと、上限を超える画像などが無いことになる）。
      const found = await pathKind(target.path, file.machine).catch(() => "missing");
      if (found === "folder") { notify({ title: "リンク先はフォルダなので開けない", body: target.path, level: "warning" }); return; }
      if (found !== "file") { notify({ title: "リンク先のファイルが無い", body: target.path, level: "warning" }); return; }
      openFile({ machine: file.machine, path: target.path, double: false });
    });
  }



  // 図を押したら、タブの上に重ねる窓で拡大して見せる（タブは増やさない）。窓に収まる大きさの SVG を絵の席に書いて、見えない所で
  // 読み込ませてから開く。1 秒たっても終わらなければ、本文の SVG を本来の大きさで出して開く（lib/zoom-svg.js の DiagramOpening）。
  // 書き込みを待つ間も 1 秒を数える（書き込みが遅くても 1 秒で開く）。収まる大きさの絵は、開くまで本文の使う場所で数え（this.opening）、
  // 開くときは、窓が出す絵の席を、まだその絵を持っていると確かめてから窓の使う場所に入れて渡す（共有なので、タブが外しても手放されない）。窓は一度に 1 つなので、前の窓の
  // 使う場所は外して作り直す（close が呼ばれなかった前の窓の絵の席は、描画を待たずに手放される）。間に合わなかった収まる大きさの絵は、
  // 書き終わったら本文から外れて手放される。
  openDiagram(part, cx) {
    const md = this.md;
    if (!part.file || !md?.look || this.opening || !this.seats) return;
    const colors = md.look.colors, l = part.layout;
    const view = window.viewport_size();
    // 窓の描ける大きさ（openOverlay の割合から、見出しの高さを引く）に収める倍率の見積もり。ずれたら窓が書き直す。
    const fit = Math.round(Math.min(3, (view.width * OVERLAY_WIDTH) / l.width, (view.height * OVERLAY_HEIGHT - 36) / l.height) * 1000) / 1000;
    const look = scaleLook(colors, fit);
    const text = diagramSvg(l, colors, { width: l.width, height: l.height });
    const opening = this.opening = { state: new DiagramOpening(Date.now()), file: null, written: false };
    cx.spawn(async (cx) => {
      const writing = (async () => {
        opening.file = await this.seatFile(part, look, null, cx);
        this.trackPictures(cx);
        this.ensureRecord();
        for (const t of opening.file.tiles) await this.writeSeatTile(t, text, opening.file, l, cx);
        await cx.sleep(SEAT_SETTLE_MS);
      })().then(
        () => { opening.state.wrote(); opening.written = true; },
        () => { opening.state.failed(); },
      );
      // 書けたら、見えない所で読み込ませるために描き直す。
      let written = false;
      while (this.opening === opening && opening.state.decide(Date.now()) === "wait") {
        await pauseForApp();
        if (opening.written !== written) { written = opening.written; cx.notify(); }
      }
      if (this.opening !== opening) return;
      const natural = opening.state.decide(Date.now()) !== "fit";
      const chosen = !natural ? { ...opening.file, scale: fit } : { ...part.file, scale: part.file.width / l.width };
      // 待つ間にテーマや本文の幅が変わって本文の絵が差し替わると、押したときの絵の絵の席は手放されて別の絵に使われうる。出す絵の
      // 絵の席が本文の集まりにあってその絵を持っているときだけ窓の集まりに入れる。入れなければ窓はその絵を出さず（init の holds）、
      // 窓に収まる倍率の絵を書いてから出す。
      const held = holds(this.seats, bodyPlace(this.token), tilesOf(chosen));
      const shown = held ? chosen : { ...chosen, scale: fit };
      const place = windowPlace(this.token);
      dropPlace(this.seats, place);
      if (held) useSeats(this.seats, place, tileNames(shown));
      this.opening = null;
      openOverlay({
        mod: "file-viewer", kind: "dialog", width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT,
        props: { mermaid: part.source, firstLine: part.firstLine, token: this.token, colors, layoutWidth: l.width, layoutHeight: l.height, svg: text, shown },
      });
      cx.notify();
      await writing;
      this.trackPictures(cx);
      await this.releaseSeats();
    });
  }

  // 拡大の窓を開く前に、書いた絵を見えない所で読み込ませる要素。
  openingPreload() {
    const opening = this.opening;
    if (!opening?.written) return null;
    opening.loaded ??= new Set();
    const files = opening.file.tiles.map((f) => ({ ...f, id: `${f.name}.${this.seatTurns.get(f.name) ?? 0}` }));
    return preloadImages({ id: "fv-open-preload", files, onLoaded: (name) => {
      opening.loaded.add(name);
      if (opening.loaded.size === opening.file.tiles.length) opening.state.loaded();
    } });
  }

  // 図の拡大の窓。受け取った SVG を画像で出し、倍率やテーマが変わったら書き直す（書き終えて読み込むまで前の絵のまま）。
  renderOverlay(t, cx) {
    const o = this.overlay;
    const close = () => closeOverlay(props()?.overlay);
    const head = h_flex().id("fv-overlay-head").h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(12).text_color(t.muted).child("図の拡大表示（Esc で閉じる）"))
      .when(Boolean(o.zs), (el) => el.child(zoomTools({ id: "fv-overlay-zoom", zoom: o.zoom, width: o.size.width, height: o.size.height, t })))
      .child(button("fv-overlay-close", "閉じる", t, close));
    const root = v_flex().id("fv-overlay").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(); } })
      .child(head);
    if (!o.zs) return root.child(div().p(16).text_color(t.dim).child("図を表示できない"));
    const colors = diagramColors(t), key = colorsKey(colors);
    o.colors[key] ??= colors;
    o.zs.recolor(key);
    if (o.zoom.view) o.zs.request(Math.round(o.zoom.current(o.size.width, o.size.height) * 1000) / 1000);
    this.runOverlayWrites(cx);
    this.trackOverlayPictures(cx);
    // file: 出している絵。窓のコピーが init し直して前の絵を確かめられなかったときは、書き直すまで無い（「整形中…」を出す）。
    const { file, notice } = o.zs.display();
    const preloads = o.zs.preloads();
    return root
      .when(Boolean(notice), (el) => el.child(this.banner("fv-overlay-notice", `図を書き出せなかった（${notice.kind === "timeout" ? "10 秒たっても終わらなかった" : notice.message}）`, t, t.blocked)))
      .child(zoomArea({
        id: "fv-overlay-area", zoom: o.zoom, width: o.size.width, height: o.size.height, shownScale: file?.scale ?? null, t,
        content: () => (file ? diagramImage(file) : waitingLabel(div(), { loading: false, t })),
      }))
      .when(preloads.length > 0, (el) => el.child(preloadImages({
        id: "fv-overlay-preload", files: preloads.map((f) => ({ ...f, id: `${f.name}.${this.seatTurns?.get(f.name) ?? 0}` })),
        onLoaded: (name, cx) => { if (o.zs.loadedImage(name)) cx.notify(); },
      })));
  }

  // 拡大の窓の書き出し直しを、描画の外で 1 つずつ進める。o.running は動かしている非同期処理の印で、見張りが手放したら
  // （戻らない書き出しを待ち続けないように）、遅れて戻った非同期処理は次の書き出しを取らずに抜ける。
  runOverlayWrites(cx) {
    const o = this.overlay;
    if (o.running) return;
    const first = o.zs.task();
    if (!first) return;
    const run = (o.running = {});
    cx.spawn(async (cx) => {
      try {
        await pauseForApp();
        for (let task = first; task; task = o.running === run ? o.zs.task() : null) {
          try {
            const text = await this.overlaySvgText(task.colorsKey);
            if (!this.seats) throw new Error("開いたタブが分からない");
            const file = await this.seatFile({ source: o.source, layout: o.size }, scaleLook(o.colors[task.colorsKey], task.scale), (name) => o.zs.fresh(name), cx);
            o.zs.writes(task, file);
            for (const t of file.tiles) await this.writeSeatTile(t, text, file, o.size, cx);
            // 書いた絵自身の変化の知らせが済んでから読み込ませる。
            await cx.sleep(SEAT_SETTLE_MS);
            o.zs.wrote(task, file);
          } catch (e) {
            o.zs.failed(task, message(e));
          }
          cx.notify();
        }
      } finally {
        if (o.running === run) o.running = null;
      }
    });
  }

  // 色の鍵の色で描いた、配置の大きさの SVG の文字列。まだ無ければ、図を配置し直して作る（描画の外で呼ぶ）。
  async overlaySvgText(key) {
    const o = this.overlay;
    if (o.svgs[key]) return o.svgs[key];
    if (!o.layout?.shown) {
      o.layout = new OverlayLayout(() => layoutMermaid(o.source, o.firstLine));
      await pauseForApp();
      o.layout.run();
    }
    const r = o.layout.shown;
    if (r.error) throw new Error(r.error.message);
    o.svgs[key] = diagramSvg(r.layout, o.colors[key], { width: o.size.width, height: o.size.height });
    return o.svgs[key];
  }

  // 拡大の窓が使っている絵の席（出している絵と、読み込ませている絵と、書いている絵）を窓の使う場所で表に渡す。差し替えて窓だけが
  // 使っていた前の絵の席は、差し替えた描画が来てから手放す（trackSeats）。出している絵も窓の使う場所に置く（同じ窓のコピーが
  // init し直したら、それから始める）。
  trackOverlayPictures(cx) {
    const zs = this.overlay.zs;
    this.trackSeats(cx, [...zs.keep()]);
    if (this.seats && zs.shown) setShown(this.seats, this.seatOwner, { file: zs.shown, colorsKey: zs.shownColors, colors: this.overlay.colors[zs.shownColors] });
  }

  // 拡大の窓の見張り: 書き直しが 10 秒たっても終わらないとき、配置し直しが止まったときは、前の絵のまま知らせる。
  watchOverlay(cx) {
    const o = this.overlay;
    if (this.seats) {
      beat(this.seats, this.seatOwner, Date.now());
      cx.spawn(async (cx) => {
        await this.rewriteLostSeats(cx);
        await this.releaseSeats();
      });
    }
    if (!o?.zs) return;
    let changed = false;
    if (o.zs.watch(Date.now())) {
      // 時間切れの書き出しは手放したので（lib/zoom-svg.js）、次の倍率・色の要求で書き出しを始め直せるようにする。
      o.running = null;
      changed = true;
    }
    if (o.layout?.watch()) {
      // 配置の途中で止まった非同期処理は戻らないので、書いていた書き出しを失敗にして、次の書き出しを始められるようにする。
      if (o.zs.writing) o.zs.failed(o.zs.writing, o.layout.shown.error.message);
      o.running = null;
      changed = true;
    }
    if (!changed) return;
    cx.spawn(async (cx) => {
      await pauseForApp();
      cx.notify();
    });
  }

  // .mmd / .mermaid: 図で開き、枠に収めて拡大・移動できるようにする。図は書き出した SVG の画像で出し、準備の間は「整形中…」。
  // 描けなければ理由とソース。
  mermaidFile(file, t) {
    const zoom = file.zoom ??= diagramZoom();
    const v = diagramFileView(this.md.display());
    if (v.kind === "preparing") {
      return div().id("fv-mmd-waiting").relative().flex_1().min_h(0).size_full().px(16).py(16).text_color(t.dim)
        .on_size_change((size, cx) => { if (size.width !== zoom.view?.width || size.height !== zoom.view?.height) { zoom.view = size; cx.notify(); } })
        .child("整形中…");
    }
    if (v.kind === "error") {
      return v_flex().id("fv-mmd").flex_1().min_h(0).overflow_y_scrollbar().p(16)
        .child(diagramError({ id: "fv-mmd-error", message: v.message, fence: v.fence, t }));
    }
    const { layout: l, file: svg } = v.part;
    return v_flex().id("fv-mmd-box").relative().flex_1().min_h(0).size_full()
      .child(zoomArea({
        id: "fv-mmd-area", zoom, width: l.width, height: l.height, shownScale: svg.width / l.width, t,
        content: () => diagramImage(svg),
      }));
  }

  // returned: タブの表示に戻った最初の描画。
  body(rec, t, cx, returned) {
    const file = this.file;
    const was = this.bodyShown;
    this.bodyShown = this.bodyKind(rec);
    // 本文の操作の印を、タブに戻ったときと整形表示を出さないときに解く（lib/body-scroll.js の BodyInput。タブが隠れたときは
    // noticeHidden も解く）。
    this.input.frame({ returned, formatted: this.bodyShown === "formatted" });
    if (!file) return div().p(16).text_color(t.dim).child(this.token ? "" : "開くファイルが指定されていない");
    if (file.loading) return markdownWaiting({ id: "fv-loading", loading: true, box: this.mdBox, t });
    const view = file.view;
    if (view.type === "unopenable") return this.unopenable(file, view, t);
    if (view.type === "image" && !(this.showsSource(rec) && file.editor)) {
      // 書き直す SVG の開くときの失敗と、app が描けない SVG は、ソース表示のボタンを残したまま開けない案内（読み込みの失敗と理由）を出す。
      const svg = this.svgView();
      if (svg?.kind === "error") return this.unopenable(file, { type: "unopenable", reason: "error", message: svg.message }, t);
      // 書き直す SVG の中身は、読んだときに元のままコピーするものと分けてあるので、元のまま（asis）はここに来ない。
      if (svg?.kind === "asis" || (!svg && !file.cache)) return div().p(16).text_color(t.dim).child("表示できない");
      return imageBody({ file, svg, t });
    }
    if (view.type === "markdown" && file.editor && !this.showsSource(rec)) {
      const md = this.md.display();
      if (md.kind === "preparing" || md.kind === "loading") {
        return markdownWaiting({ id: "fv-markdown-waiting", loading: md.kind === "loading", box: this.mdBox, t });
      }
      const entering = was !== "formatted";
      this.mdScroll.expect(measuredParts(md.parts), Date.now(), { fresh: entering });
      if (entering) this.awaitBody(was);
      if (this.mdScroll.collapsed) this.watchBody(cx);
      else this.mdCover = null;
      const cover = this.mdCover === "source" ? Editor.new(file.editor).flex_1().min_h(0)
        : this.mdCover ? waitingLabel(div().size_full(), { loading: this.mdCover === "loading", t }) : null;
      return markdownBody({
        id: "fv-markdown", parts: md.parts, box: this.mdBox, scroll: this.mdScroll, bar: this.bar, cover, t,
        onScroll: (changed, cx) => this.syncBar(changed, cx),
        onWheel: (changed, cx) => { if (changed) this.showBar(cx); this.syncBar(changed, cx); },
        barShown: this.input.showBar(Date.now(), thumbSpan(this.mdScroll)),
        onBarPointer: (y, cx) => this.barPointer(y, cx),
        drag: { press: (e) => this.dragPress(e), release: () => this.input.release(), move: (e, cx) => this.dragMove(e, cx) },
        onLink: (url, cx) => this.followLink(url, cx),
        onDiagram: (part, cx) => this.openDiagram(part, cx),
      });
    }
    if (view.type === "mermaid" && file.editor && !this.showsSource(rec)) return this.mermaidFile(file, t);
    if (file.editor) return Editor.new(file.editor).flex_1().min_h(0);
    return div().p(16).text_color(t.dim).child("表示できない");
  }

  // 本文の場所に出すもの（"formatted" | "source" | "preparing" | "loading" | null。Markdown のときだけ見分ける）。
  bodyKind(rec) {
    const file = this.file;
    if (!file) return null;
    if (file.loading) return "loading";
    if (file.view.type !== "markdown" || !file.editor) return null;
    if (this.showsSource(rec)) return "source";
    const kind = this.md.display().kind;
    return kind === "preparing" || kind === "loading" ? kind : "formatted";
  }

  // ソース表示や待つ間から整形表示に入った。整形表示の部品は中身を描くまでの数フレーム空になる（ガイドの「制約」）ので、
  // 入る前の表示（was）が本文の場所にあったなら、部品が中身を描くまで、それを本文の上に重ねて出し続ける。
  awaitBody(was) {
    this.mdCover = was === "source" || was === "preparing" || was === "loading" ? was : null;
  }

  // 本文の部品が中身を描くのを待っている（縮んでいる）。入ったときに限らず、中身の差し替えやタブの表示に戻ったときにも縮むので、
  // 縮むたびに見て、BODY_WAIT_MS を過ぎても高さの来ない部分は数えるのをやめる（縮んだままだと位置が本文の長さに収まらない）。
  // 見るのは mdScroll ごとに 1 つ（黙って止まったら、次の描画で見直す。BodyInput の watch）。
  watchBody(cx) {
    const scroll = this.mdScroll, lease = this.input.watch;
    const owner = lease.take(scroll, Date.now());
    if (!owner) return;
    cx.spawn(async (cx) => {
      try {
        while (this.mdScroll === scroll && scroll.collapsed && lease.step(owner, Date.now())) {
          await pauseForApp();
          if (this.mdScroll === scroll && scroll.expire(Date.now(), BODY_WAIT_MS)) cx.notify();
        }
      } finally {
        lease.end(owner);
      }
    });
  }

  // 本文をスクロールした。スクロールバーを出し、出す時間が過ぎたら描き直して消す。
  showBar(cx) {
    const now = Date.now();
    this.input.bar.scrolled(now);
    // 予定の描き直しが無いか、予定の時刻を過ぎても来なかったときは入れ直す。
    if (!(this.barDue > now - BODY_STALE_MS)) this.hideBarLater(cx);
  }

  hideBarLater(cx) {
    const now = Date.now();
    const left = this.input.bar.remaining(now);
    if (left === null) { this.barDue = null; cx.notify(); return; }
    this.barDue = now + left + 10;
    cx.timer.after(left + 10, (cx) => this.hideBarLater(cx));
  }

  // スクロールバーの帯の上のマウスの位置（離れたら null）。つまみに載ったか離れたかが変わったときだけ描き直す
  // （載っている間はスクロールバーを出したままにする）。
  barPointer(y, cx) {
    const input = this.input;
    input.pointerAt(y);
    if (input.onThumb(thumbSpan(this.mdScroll)) !== input.bar.hovered) cx.notify();
  }

  // 本文の中で左ボタンを押した（描いているスクロールバーの上は除く。消えている間は、右端も本文）。app は押したボタンを
  // mouse move で知らせないので、押している間を自分で覚える。
  dragPress(e) {
    const x = e.local_position?.x, w = e.bounds?.width;
    if (this.input.barDrawn && x !== undefined && w !== undefined && x >= w - BAR_INSET * 2 - BAR_WIDTH * 2) return;
    this.input.pressed = true;
  }

  // 押したまま動かした。上下の端の帯にいる間、本文をスクロールし続ける。選んでいる範囲は、部品がマウスの動きを受けたときに
  // そこまで伸びる（止めたままだと伸びない。ガイドの「制約」の「選びながらのスクロール」）。
  dragMove(e, cx) {
    const d = this.input;
    if (!d.pressed) return;
    const y = e.local_position.y, h = e.bounds.height;
    if (y < DRAG_EDGE) { d.dir = -1; d.depth = (DRAG_EDGE - y) / DRAG_EDGE; }
    else if (y > h - DRAG_EDGE) { d.dir = 1; d.depth = (y - (h - DRAG_EDGE)) / DRAG_EDGE; }
    else d.dir = 0;
    if (d.dir) this.dragScroll(cx);
  }

  // 1 歩ごとに入出力の await を挟む（ガイドの「長い同期処理」）。動いた時間に比べて進めるので、歩の間隔が揺れても速さは同じ。
  // 動いている繰り返しがあれば始めない（黙って止まっていたら始め直す。BodyInput の drag）。表示していない間は render が
  // 呼ばれず、印を解く noticeHidden も POLL_MS おきなので、タブが表示されているかは歩ごとに見る。
  dragScroll(cx) {
    const d = this.input, scroll = this.mdScroll, lease = d.drag;
    const owner = lease.take(scroll, Date.now());
    if (!owner) return;
    cx.spawn(async (cx) => {
      try {
        let last = Date.now();
        while (d.pressed && d.dir && this.mdScroll === scroll && lease.step(owner, Date.now()) && this.visibleNow()) {
          await pauseForApp();
          await cx.sleep(16);
          const now = Date.now();
          const speed = DRAG_SPEED_MIN + (DRAG_SPEED_MAX - DRAG_SPEED_MIN) * Math.min(1, Math.max(0, d.depth));
          const step = d.dir * speed * (now - last) / 1000;
          last = now;
          // 本文の端まで来たら止める（帯の中でまた動かせば、dragMove が始め直す）。
          if (!scroll.wheel(-step)) break;
          this.showBar(cx);
          this.syncBar(true, cx);
        }
      } finally {
        lease.end(owner);
      }
    });
  }

  // 今タブが表示されているか（visible は前の描画のときの見え方で、表示していない間は描画が無いので古い）。
  visibleNow() {
    const me = this.identify();
    return Boolean(me?.space.active && me.tabInfo?.active);
  }

  // スクロールの位置が変わった（changed）か、本文の長さが変わったとき。スクロールバーのつまみを位置に合わせる。
  syncBar(changed, cx) {
    const v = Math.round((1 - this.mdScroll.fraction()) * BAR_MAX);
    if (Math.abs(Number(this.bar.value()) - v) > 1) { this.barSet = v; this.bar.set_value(v); changed = true; }
    if (changed) cx.notify();
  }

  unopenable(file, view, t) {
    const reason = unopenableReason(view, file.size);
    return v_flex().id("fv-unopenable").p(20).gap(8)
      .child(div().text_size(14).font_semibold().child(reason))
      .child(div().text_size(12).text_color(t.muted).child(file.path))
      .when(file.size !== undefined, (el) => el.child(div().text_size(12).text_color(t.muted).child(formatSize(file.size))));
  }
}
