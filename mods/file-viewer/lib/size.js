// ファイルの大きさと上限の言い表し方。
const KiB = 1024;
const MiB = 1024 * 1024;

export function formatSize(bytes) {
  if (bytes < KiB) return `${bytes} B`;
  if (bytes < MiB) return `${(bytes / KiB).toFixed(1)} KiB`;
  return `${(bytes / MiB).toFixed(1)} MiB`;
}

function formatLimit(bytes) {
  if (bytes % MiB === 0) return `${bytes / MiB} MiB`;
  // QuickJS の toLocaleString は桁区切りを付けないことがあるので自前で区切る。
  return `${String(bytes).replace(/\B(?=(\d{3})+$)/g, ",")} バイト`;
}

export function limitMessage({ limit, size }) {
  return `大きすぎる（上限 ${formatLimit(limit)}、このファイル ${formatSize(size)}）`;
}
