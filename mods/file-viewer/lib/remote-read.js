// ほかの machine のファイルのバイト列を、区切って base64 で受け取るための決まり（io.js の copyImage・checkUtf8）。
// ほかの machine の exec は hc exec --json の出力を 8 MiB まで読み、その中で標準出力がもう一度 base64 になる（ガイドの「制約」の
// exec）。base64 にしたファイルを 1 回で受け取れるのは約 4.7 MB までなので、画像の上限（6,000,000 バイト）まで受け取れるように、
// 3 MiB ずつ読む（base64 で 4 MiB、JSON の中で約 5.3 MiB）。区切りの長さは 3 の倍数にして、区切りごとの base64 をつないでも
// 1 つの base64 になるようにする。
export const READ_CHUNK = 3 * 1024 * 1024;

// 大きさ size のファイルを chunk ずつ読む区切り（[{ offset, length }]）。
export function chunkRanges(size, chunk = READ_CHUNK) {
  const ranges = [];
  for (let offset = 0; offset < size; offset += chunk) ranges.push({ offset, length: Math.min(chunk, size - offset) });
  return ranges;
}

// length バイトの base64 の文字数（= で埋めた分を含む）。読んだ区切りの長さを確かめる。
export const base64Length = (length) => Math.ceil(length / 3) * 4;

// sh のスクリプトの一部: パス "$1" のファイルの、引数 offsetArg 番目の位置から引数 lengthArg 番目の長さのバイト列を、
// 改行なしの base64 で標準出力に出す。パイプの終了コードは最後の base64 のものなので、読めないファイル（権限が無いなど）は先に
// 開いて確かめ、開けなければ sh が理由を stderr に出して 0 以外で終える（読めない理由が読み込みの失敗の理由に届くように）。
export function chunkCommand(offsetArg, lengthArg) {
  return `exec 3< "$1" || exit 1; tail -c +"$(( \${${offsetArg}} + 1 ))" <&3 | head -c "\${${lengthArg}}" | base64 -w0`;
}
