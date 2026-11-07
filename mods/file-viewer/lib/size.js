// ファイルの大きさと上限の言い表し方。
const KiB = 1024;
const MiB = 1024 * 1024;

export function formatSize(bytes) {
  if (bytes < KiB) return `${bytes} B`;
  if (bytes < MiB) return `${(bytes / KiB).toFixed(1)} KiB`;
  return `${(bytes / MiB).toFixed(1)} MiB`;
}

// QuickJS の toLocaleString は桁区切りを付けないことがあるので自前で区切る。
const formatBytes = (bytes) => `${String(bytes).replace(/\B(?=(\d{3})+$)/g, ",")} バイト`;

// 上限と今の大きさを並べて出すときの 2 つの文字列。丸めると同じになるなら、超えたことが読み取れるようにバイト数で出す。
export function formatSizes(limit, size) {
  const pair = [formatSize(limit), formatSize(size)];
  return pair[0] === pair[1] ? [formatBytes(limit), formatBytes(size)] : pair;
}

function formatLimit(bytes) {
  if (bytes % MiB === 0) return `${bytes / MiB} MiB`;
  return formatBytes(bytes);
}

export function limitMessage({ limit, size }) {
  return `大きすぎる（上限 ${formatLimit(limit)}、このファイル ${formatSize(size)}）`;
}
