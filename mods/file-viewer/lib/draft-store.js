// 下書きのファイルの読み書き。fs は fs/promises の形（mkdir / readdir / readFile / writeFile / unlink）、
// dir は下書きのフォルダを返す関数。
//
// 1 つの下書きは 2 つの枠（<name> の .json の前に .a / .b を付けたファイル）に交互に書く。
// 書き込みの途中でアプリが止まっても、もう一方の枠に前の下書きが残る
// （fs/promises に rename が無いので、一時ファイルに書いて置き換える形は取れない）。
const SLOT = /\.(a|b)\.json$/;
const slotFile = (name, slot) => name.replace(/\.json$/, `.${slot}.json`);

export function createDraftStore(fs, dir) {
  const nextSlot = new Map();   // 下書きの名前 → 次に書く枠

  async function readDraftFile(file) {
    try { return JSON.parse(await fs.readFile(`${dir()}/${file}`, "utf8")); }
    catch { return null; }   // 書きかけや壊れたもの
  }

  // すべての下書き。同じ下書きの枠は、読めるもののうち新しい方を 1 つ返す。各下書きに name（枠を除いた名前）を付ける。
  async function list() {
    const files = await fs.readdir(dir()).catch(() => []);
    const newest = new Map();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const body = await readDraftFile(file);
      if (!body) continue;
      const name = file.replace(SLOT, ".json");
      const seen = newest.get(name);
      if (!seen || (body.updatedAt ?? 0) > (seen.updatedAt ?? 0)) newest.set(name, { ...body, name });
    }
    return [...newest.values()];
  }

  // name: 枠を除いた下書きの名前。body: 書く中身。
  async function write(name, body) {
    await fs.mkdir(dir(), { recursive: true }).catch(() => {});
    let slot = nextSlot.get(name);
    if (!slot) {
      // このコピーで初めて書くときは、読めないか古い方の枠に書く。
      const [a, b] = await Promise.all([readDraftFile(slotFile(name, "a")), readDraftFile(slotFile(name, "b"))]);
      slot = !a ? "a" : !b ? "b" : (a.updatedAt ?? 0) <= (b.updatedAt ?? 0) ? "a" : "b";
    }
    nextSlot.set(name, slot === "a" ? "b" : "a");
    try {
      await fs.writeFile(`${dir()}/${slotFile(name, slot)}`, JSON.stringify(body));
    } catch (error) {
      // 書けなかった枠に次も書く。もう一方の枠には書き終えた下書きが入っているので、触らない。
      nextSlot.set(name, slot);
      throw error;
    }
  }

  async function remove(name) {
    nextSlot.delete(name);
    for (const file of [name, slotFile(name, "a"), slotFile(name, "b")]) await fs.unlink(`${dir()}/${file}`).catch(() => {});
  }

  return { list, write, remove };
}
