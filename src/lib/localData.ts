import os from "node:os";
import path from "node:path";

export function getLocalDataDir() {
  const override = process.env.LOCAL_DATA_DIR?.trim();
  if (override) return override;
  if (process.env.VERCEL === "1") return path.join(os.tmpdir(), "polymarket-local-data");
  return path.join(process.cwd(), ".local-data");
}

export function getMarketsIndexPath() {
  return path.join(getLocalDataDir(), "markets.json");
}

export function getSnapshotsPath() {
  return path.join(getLocalDataDir(), "snapshots.jsonl");
}
