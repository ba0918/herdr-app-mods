import { describe, expect, test } from "bun:test";
import { staleRecords, STALE_MS, PENDING_MS } from "../mods/file-viewer/lib/records.js";

const now = 1_000_000_000;
const base = { livePanes: new Set(["p1"]), readyMachines: new Set(["wsl"]), now };

describe("staleRecords", () => {
  test("ペインが今あるタブの記録は残し、見えなくなった時刻の印を消す", () => {
    const r = staleRecords({ ...base, records: { a: { pane: "p1", machine: "wsl", missingSince: now - 5 } } });
    expect(r).toEqual({ drop: [], mark: {}, unmark: ["a"] });
  });

  test("ペインが見えなくなった記録は、すぐには消さず見えなくなった時刻を付ける", () => {
    const r = staleRecords({ ...base, records: { a: { pane: "gone", machine: "wsl" } } });
    expect(r).toEqual({ drop: [], mark: { a: now }, unmark: [] });
  });

  test("見えないまま一定時間たった記録だけを消す", () => {
    const r = staleRecords({ ...base, records: {
      old: { pane: "gone", machine: "wsl", missingSince: now - STALE_MS - 1 },
      recent: { pane: "gone", machine: "wsl", missingSince: now - 1000 },
    } });
    expect(r).toEqual({ drop: ["old"], mark: {}, unmark: [] });
  });

  test("layout を読み終えていない machine の記録には触らない", () => {
    const r = staleRecords({ ...base, records: { a: { pane: "gone", machine: "ssh-box", missingSince: now - STALE_MS - 1 } } });
    expect(r).toEqual({ drop: [], mark: {}, unmark: [] });
  });

  test("名乗らないまま古くなった記録（tab.new が失敗したなど）を消す", () => {
    const r = staleRecords({ ...base, records: {
      stuck: { pane: null, machine: "wsl", createdAt: now - PENDING_MS * 6 - 1 },
      fresh: { pane: null, machine: "wsl", createdAt: now - 1000 },
    } });
    expect(r).toEqual({ drop: ["stuck"], mark: {}, unmark: [] });
  });

  test("このコンピュータ（machine が null）は空文字の名前で読み終えたかを見る", () => {
    const r = staleRecords({ ...base, readyMachines: new Set([""]), records: { a: { pane: "gone", machine: null } } });
    expect(r).toEqual({ drop: [], mark: { a: now }, unmark: [] });
  });
});
