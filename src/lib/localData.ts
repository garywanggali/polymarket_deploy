import path from "node:path";

export function getLocalDataDir() {
  return path.join(process.cwd(), ".local-data");
}

export function getMarketsIndexPath() {
  return path.join(getLocalDataDir(), "markets.json");
}

export function getSnapshotsPath() {
  return path.join(getLocalDataDir(), "snapshots.jsonl");
}

