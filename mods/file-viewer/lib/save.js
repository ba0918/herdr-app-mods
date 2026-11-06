// 保存する内容を作る処理: 他 machine へ書くための分割、改行の保持、文字コードの判定。

// UTF-8 のバイト数（mod の実行環境に TextEncoder が無いので自前で数える）。
// 保存のたびに数十万文字を数えるので、1 文字ごとにオブジェクトを作らない。
export function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

// exec の引数としての長さ。mod の exec は Windows 側で hc を起動するので、コマンドライン全体が
// UTF-16 で約 32,000 文字に収まらないと起動できない。" と \\ はエスケープで 2 文字になりうる。
export function argLength(text) {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    units += code === 0x22 || code === 0x5c ? 2 : 1;
  }
  return units;
}

// exec の 1 引数に収まるよう分ける。Linux の 1 引数の上限（UTF-8 で maxBytes）と、Windows の
// コマンドラインの上限（argLength で maxUnits）の両方を守り、サロゲートペアは切らない。
export function splitForWrite(text, maxBytes = 100_000, maxUnits = 24_000) {
  const parts = [];
  let start = 0, bytes = 0, units = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const pair = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length;
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : pair ? 4 : 3;
    const width = pair ? 2 : code === 0x22 || code === 0x5c ? 2 : 1;
    if (bytes + size > maxBytes || units + width > maxUnits) {
      parts.push(text.slice(start, i));
      start = i;
      bytes = 0;
      units = 0;
    }
    bytes += size;
    units += width;
    if (pair) i++;
  }
  parts.push(text.slice(start));
  return parts;
}

// 読んだときの改行（LF / CRLF）と末尾の改行の有無を、編集後の内容に当て直す。
export function preserveLineEndings(original, edited) {
  const crlf = (original.match(/\r\n/g) ?? []).length;
  const lf = (original.match(/\n/g) ?? []).length - crlf;
  const eol = crlf > lf ? "\r\n" : "\n";
  const finalNewline = original.endsWith("\n");
  let text = edited.replace(/\r\n/g, "\n");
  if (finalNewline && !text.endsWith("\n") && text !== "") text += "\n";
  if (!finalNewline && text.endsWith("\n")) text = text.slice(0, -1);
  return eol === "\n" ? text : text.replace(/\n/g, eol);
}

export function looksNonUtf8(text) {
  return text.includes("�");
}
