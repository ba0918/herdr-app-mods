import { describe, expect, test } from "bun:test";
import { oldCacheNames } from "../mods/file-viewer/lib/pictures.js";

// 仕様の「画像の置き場所」の「片付け」: 前の置き場所 file-viewer-cache/ では、名前の形が file-viewer のものだけを消す。
const TOKEN = "3f2b9c1e-8a7d-4e6f-9b0c-1d2e3f4a5b6c";

describe("前の置き場所で消すファイル", () => {
  test("前の名前の形（<token>[~<印>]-<ハッシュ 12 桁>、.b64 を含む）のものだけを選ぶ", () => {
    const old = [`${TOKEN}-0123456789ab.svg`, `${TOKEN}~z1a-abcdef012345.svg`, `${TOKEN}-0123456789ab.png.b64`];
    const others = ["notes.txt", "seat-00001.img", "desktop.ini"];
    expect(oldCacheNames([...old, ...others])).toEqual(old);
  });
});
