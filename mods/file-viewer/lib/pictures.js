// 絵のファイル（画像のコピーと図の SVG）の名前、持ち方、手放す絵と片付けるファイルの選び方（仕様の「画像の置き場所」）。
// 絵のファイルは付き添いの mod file-viewer-images のフォルダに置く。app は読み込んだ画像をパスごとに覚え、mods/ の下のアセットが
// 書き換えられたときだけ取り直して前の絵を放すので、使わなくなった絵はごく小さい同じ形式の絵で書き換えて（手放して）から消す。
// 書き込みと消すことは main.js と io.js がする。

export const IMAGES_MOD = "file-viewer-images";
export const IMAGES_DIR = `mods/${IMAGES_MOD}`;

// 名前の書いた時刻（Date.now() の 36 進）の桁の数。9 桁で 2059 年まで同じ幅になり、前の置き場所の名前（ハッシュ 12 桁）と
// 取り違えない。
const TIME_DIGITS = 9;

// <タブの token>[~<窓の印>]-<書いた時刻>-<連番>.<拡張子>（画像のコピーの途中の一時ファイルは、その後ろに .b64）。
// token（UUID）は「-」を含むので、読み戻しは末尾から決める。
const PICTURE_NAME = new RegExp(`^([^~]+?)(?:~([0-9a-z]+))?-([0-9a-z]{${TIME_DIGITS}})-([0-9a-z]+)\\.([0-9a-z]+)(\\.b64)?$`);

// 名前から { token, mark, time, b64 } を読む。絵のファイルの名前の形でなければ null。
export function parsePictureName(name) {
  const m = PICTURE_NAME.exec(name);
  if (!m) return null;
  return { token: m[1], mark: m[2] ?? null, time: parseInt(m[3], 36), b64: Boolean(m[6]) };
}

// コピー（タブか拡大の窓の JavaScript のインスタンス）ごとの名前の作り手。名前を決めたときの時刻と、コピーの中の連番を入れるので、
// 同じコピーの中でも、同じ token の別のコピー（再起動で復元したタブ）とでも名前が重ならず、手放した名前を使い直さない。
export class PictureNames {
  constructor({ token, mark = null, clock = Date.now }) {
    this.prefix = `${token}${mark ? `~${mark}` : ""}`;
    this.clock = clock;
    this.seq = 0;
  }

  next(ext) {
    const time = this.clock().toString(36).padStart(TIME_DIGITS, "0");
    return `${this.prefix}-${time}-${(this.seq++).toString(36)}.${ext}`;
  }
}

// コピーが持つ、今使っている（か書いている途中の）絵の表（「見た目の鍵 → 名前」）。表にある鍵の絵は同じ名前を使い、書き直さない。
// 手放したら鍵を表から外し、同じ見た目がまた要るときは新しい名前で書く（仕様の「手放した名前は使い直さない」）。
// 絵を使う場所（本文、拡大の窓に貸した絵、image viewer のコピーなど）ごとに今使っている名前を use で渡す。どの場所も使っていない名前を、
// 描画で使う名前を渡し終えたとき（commit）に選び、その描画が済んだ（drawn）あとに手放す（新しい絵を画面で差し替えてから前の絵を
// 手放す）。書いている途中の名前は書き終わってから、一度も書いていない名前と付き添いの mod が無いときは手放さずに表から外す。
export class PictureTable {
  // names: 名前の作り手（PictureNames）。
  constructor(names) {
    this.names = names;
    this.entries = new Map(); // 名前 → { key, writing, written }
    this.byKey = new Map();   // 見た目の鍵 → 名前
    this.places = new Map();  // 使う場所 → 名前の Set
    this.frame = 0;
    this.candidates = [];     // { frame, names }: その描画で、どの場所も使っていなかった名前
    this.due = new Set();     // 描画が済んで、手放してよくなった名前
  }

  // 見た目の鍵 key の絵の名前。表にあればそれ、無ければ新しい名前を表に載せる。key が null なら、いつも新しい名前（画像のコピー）。
  name(key, ext) {
    if (key !== null && this.byKey.has(key)) return this.byKey.get(key);
    const name = this.names.next(ext);
    this.entries.set(name, { key, writing: false, written: false });
    if (key !== null) this.byKey.set(key, name);
    return name;
  }

  has(name) {
    return this.entries.has(name);
  }

  // 書いてある絵を表に載せる（拡大の窓が、開いたタブの書いた絵を受け取るとき）。
  adopt(name, key = null) {
    this.entries.set(name, { key, writing: false, written: true });
    if (key !== null) this.byKey.set(key, name);
  }

  writing(name) {
    const e = this.entries.get(name);
    if (e) e.writing = true;
  }

  // 書き終えた（失敗も含む。途中まで書いたファイルがあるかもしれないので、手放して消す）。
  wrote(name) {
    const e = this.entries.get(name);
    if (!e) return;
    e.writing = false;
    e.written = true;
  }

  // place が今使っている名前（前に渡したものと置き換える）。
  use(place, names) {
    this.places.set(place, new Set(names));
  }

  used(name) {
    for (const names of this.places.values()) if (names.has(name)) return true;
    return false;
  }

  // 描画で使う名前を渡し終えた。今どの場所も使っていない名前を選んでおき、描画の番号を返す（drawn に渡す）。
  commit() {
    const frame = ++this.frame;
    const unused = [...this.entries.keys()].filter((name) => !this.used(name));
    if (unused.length) this.candidates.push({ frame, names: unused });
    return frame;
  }

  // frame の描画が済んだ。そのとき選んだ名前を、手放してよい名前にする。
  drawn(frame) {
    const rest = [];
    for (const c of this.candidates) {
      if (c.frame > frame) rest.push(c);
      else for (const name of c.names) this.due.add(name);
    }
    this.candidates = rest;
  }

  // 書いたはずのファイルが無くなっていた。鍵を外し、同じ見た目は新しい名前で書かせる（名前は使わなくなったら手放す。app はその
  // 名前の絵を覚えているので）。
  lost(names) {
    for (const name of names) {
      const e = this.entries.get(name);
      if (!e || e.key === null) continue;
      if (this.byKey.get(e.key) === name) this.byKey.delete(e.key);
      e.key = null;
    }
  }

  // 手放さずに表から外す（拡大の窓に渡した絵）。
  forget(names) {
    for (const name of names) this.remove(name);
  }

  // 手放す名前（表から外す）。companion: 付き添いの mod があるか。無ければ、手放さずに表から外すだけにする。
  takeReleases(companion) {
    const out = [];
    for (const name of [...this.due]) {
      const e = this.entries.get(name);
      if (!e || this.used(name)) {
        this.due.delete(name);
        continue;
      }
      if (e.writing) continue;
      this.due.delete(name);
      this.remove(name);
      if (e.written && companion) out.push(name);
    }
    return out;
  }

  remove(name) {
    const e = this.entries.get(name);
    if (!e) return;
    this.entries.delete(name);
    this.due.delete(name);
    if (e.key !== null && this.byKey.get(e.key) === name) this.byKey.delete(e.key);
  }
}

// 手放した（ごく小さい絵で書き換えた）ファイルを消すまでの待ち（ms）。mods/ の下の絵は、書き換えた直後に消しても app が前の絵を
// 放した（ガイドの「image(path) のメモリ」）ので待たない。
export const RELEASE_WAIT_MS = 0;

// 手放したファイルを、待ちを過ぎてから消す名前にする（手放したコピーでも見張りでも同じ）。
export class ReleaseQueue {
  constructor(wait = RELEASE_WAIT_MS) {
    this.wait = wait;
    this.items = []; // { name, at }
  }

  // names を at に手放した。
  released(names, at) {
    for (const name of names) this.items.push({ name, at });
  }

  // now に消してよい名前（返したものは忘れる）。
  due(now) {
    const out = [], rest = [];
    for (const item of this.items) (now - item.at >= this.wait ? out : rest).push(item);
    this.items = rest;
    return out.map((item) => item.name);
  }
}

// 持ち主の無い絵を片付けるまでの、名前の時刻からの時間（ms）。開いたばかりで、まだ記録に載っていないタブの絵を取り違えないように。
export const ORPHAN_AGE_MS = 10_000;

// 見張りが片付けるファイル。names: 付き添いの mod のフォルダのファイルの名前、openTokens: 開いているタブの token。
// 絵のファイルの名前の形で、token が開いているタブのどれでもなく、名前の時刻から 10 秒以上たったもの。
// { release: 手放してから消す名前, remove: 消すだけの名前（.b64。絵ではない） }。
export function sweepTargets({ names, openTokens, now, minAge = ORPHAN_AGE_MS }) {
  return pick(names, (p) => !openTokens.has(p.token) && now - p.time >= minAge);
}

// コピーの始めの回に自分で片付けるファイル: 自分の token（窓の印の付いたものを含む）で、名前の時刻がそのコピーの始まりより前のもの
// （再起動で復元したタブの、前のコピーが書いた絵）。形は sweepTargets と同じ。
export function ownStale({ names, token, startedAt }) {
  return pick(names, (p) => p.token === token && p.time < startedAt);
}

function pick(names, chosen) {
  const release = [], remove = [];
  for (const name of names) {
    const p = parsePictureName(name);
    if (p && chosen(p)) (p.b64 ? remove : release).push(name);
  }
  return { release, remove };
}

// 前の置き場所（app home 直下の file-viewer-cache/）で使っていた名前の形: <token>[~<窓の印>]-<ハッシュ 12 桁>.<拡張子>[.b64]。
export const OLD_CACHE_DIR = "file-viewer-cache";
const OLD_CACHE_NAME = /^(.+?)(?:~([0-9a-z]+))?-[0-9a-f]{12}\.[^.]+(?:\.b64)?$/;

// 前の置き場所で消すファイル（file-viewer が書いた名前の形のものだけ）。
export function oldCacheNames(names) {
  return names.filter((name) => OLD_CACHE_NAME.test(name));
}

// 付き添いの mod が入っているか（mods/file-viewer-images/ に main.js と mod.json の両方があるか）。
export function companionInstalled({ main, mod }) {
  return Boolean(main && mod);
}

// 付き添いの mod が入っていないので描けない図の理由（仕様の「描けない図」）。
export const COMPANION_MISSING = { kind: "companion", message: "付き添いの mod が入っていない" };

// 手放すときに書く、ごく小さい同じ形式の絵（1 × 1）。SVG は文字列 { text }、ほかは base64 { base64 }（mod からはバイナリを書けないので、
// PowerShell でバイト列に戻して書く）。png・jpg・gif・bmp・ico（png を包んだもの）・webp は ffmpeg で作り、どれも書き換えると
// app が前の絵を放した（ガイドの「image(path) のメモリ」）。
const TINY = {
  png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADElEQVR4nGNkYGAAAAAIAAI76MGHAAAAAElFTkSuQmCC",
  jpg: "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYzLjEuMTAyAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAEsAAQEAAAAAAAAAAAAAAAAAAAAIAQEAAAAAAAAAAAAAAAAAAAAAEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAAQABAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8An8AH/9k=",
  gif: "R0lGODlhAQABAPcfMQAAACQAAEgAAGwAAJAAALQAANgAAPwAAAAkACQkAEgkAGwkAJAkALQkANgkAPwkAABIACRIAEhIAGxIAJBIALRIANhIAPxIAABsACRsAEhsAGxsAJBsALRsANhsAPxsAACQACSQAEiQAGyQAJCQALSQANiQAPyQAAC0ACS0AEi0AGy0AJC0ALS0ANi0APy0AADYACTYAEjYAGzYAJDYALTYANjYAPzYAAD8ACT8AEj8AGz8AJD8ALT8ANj8APz8AAAAVSQAVUgAVWwAVZAAVbQAVdgAVfwAVQAkVSQkVUgkVWwkVZAkVbQkVdgkVfwkVQBIVSRIVUhIVWxIVZBIVbRIVdhIVfxIVQBsVSRsVUhsVWxsVZBsVbRsVdhsVfxsVQCQVSSQVUiQVWyQVZCQVbSQVdiQVfyQVQC0VSS0VUi0VWy0VZC0VbS0Vdi0Vfy0VQDYVSTYVUjYVWzYVZDYVbTYVdjYVfzYVQD8VST8VUj8VWz8VZD8VbT8Vdj8Vfz8VQAAqiQAqkgAqmwAqpAAqrQAqtgAqvwAqgAkqiQkqkgkqmwkqpAkqrQkqtgkqvwkqgBIqiRIqkhIqmxIqpBIqrRIqthIqvxIqgBsqiRsqkhsqmxsqpBsqrRsqthsqvxsqgCQqiSQqkiQqmyQqpCQqrSQqtiQqvyQqgC0qiS0qki0qmy0qpC0qrS0qti0qvy0qgDYqiTYqkjYqmzYqpDYqrTYqtjYqvzYqgD8qiT8qkj8qmz8qpD8qrT8qtj8qvz8qgAA/yQA/0gA/2wA/5AA/7QA/9gA//wA/wAk/yQk/0gk/2wk/5Ak/7Qk/9gk//wk/wBI/yRI/0hI/2xI/5BI/7RI/9hI//xI/wBs/yRs/0hs/2xs/5Bs/7Rs/9hs//xs/wCQ/ySQ/0iQ/2yQ/5CQ/7SQ/9iQ//yQ/wC0/yS0/0i0/2y0/5C0/7S0/9i0//y0/wDY/yTY/0jY/2zY/5DY/7TY/9jY//zY/wD8/yT8/0j8/2z8/5D8/7T8/9j8//z8/yH/C05FVFNDQVBFMi4wAwEAAAAh+QQEBAAfACwAAAAAAQABAAAIBAABBAQAOw==",
  bmp: "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  ico: "AAABAAEAAQEAAAEAIABbAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAABAAAAAQgGAAAAHxXEiQAAAAlwSFlzAAAAAQAAAAEATyXE1gAAAA1JREFUeJxjZGBg+A8AAQkBASnRwPQAAAAASUVORK5CYII=",
  webp: "UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAAAcQEf0PRET/Aw==",
};
const TINY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

export function tinyPicture(ext) {
  const e = ext.toLowerCase();
  if (e === "svg") return { text: TINY_SVG };
  return { base64: TINY[e === "jpeg" ? "jpg" : e] };
}
