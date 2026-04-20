import fs from "node:fs/promises";
import path from "node:path";

import { getLocalDataDir, getMarketsIndexPath, getSnapshotsPath } from "./localData";
import type { MarketIndex } from "./types";

export type SnapshotOutcome = { name: string; price: number | null };
export type SnapshotMarket = {
  slug: string;
  liquidity: number | null;
  volume24hr: number | null;
  outcomes: SnapshotOutcome[];
};
export type SnapshotLine = { t: string; markets: SnapshotMarket[] };

const KV_MARKETS_KEY = "polymarket:markets:index";
const KV_SNAPSHOTS_KEY = "polymarket:snapshots:lines";
const KV_SNAPSHOT_MAX_LINES = 2000;

function hasKvEnv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

type KvClient = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: string): Promise<unknown>;
  rpush(key: string, ...values: string[]): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
};

let kvClientPromise: Promise<KvClient | null> | null = null;

async function getKvClient(): Promise<KvClient | null> {
  if (!hasKvEnv()) return null;
  if (!kvClientPromise) {
    kvClientPromise = import("@vercel/kv")
      .then((mod) => {
        if (!mod.kv) return null;
        return mod.kv as unknown as KvClient;
      })
      .catch(() => null);
  }
  return kvClientPromise;
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readMarketIndex(): Promise<MarketIndex | null> {
  const kv = await getKvClient();
  if (kv) {
    try {
      const raw = await kv.get<string>(KV_MARKETS_KEY);
      if (!raw || typeof raw !== "string") return null;
      return JSON.parse(raw) as MarketIndex;
    } catch {
      return null;
    }
  }

  try {
    const raw = await fs.readFile(getMarketsIndexPath(), "utf8");
    return JSON.parse(raw) as MarketIndex;
  } catch {
    return null;
  }
}

export async function writeMarketIndex(index: MarketIndex) {
  const kv = await getKvClient();
  if (kv) {
    await kv.set(KV_MARKETS_KEY, JSON.stringify(index));
    return;
  }

  const dir = getLocalDataDir();
  await ensureDir(dir);

  const finalPath = getMarketsIndexPath();
  const tempPath = path.join(dir, `markets.${Date.now()}.tmp.json`);

  await fs.writeFile(tempPath, JSON.stringify(index, null, 2), "utf8");
  await fs.rename(tempPath, finalPath);
}

export async function appendSnapshotLine(line: unknown) {
  const kv = await getKvClient();
  if (kv) {
    const serialized = JSON.stringify(line);
    await kv.rpush(KV_SNAPSHOTS_KEY, serialized);
    await kv.ltrim(KV_SNAPSHOTS_KEY, -KV_SNAPSHOT_MAX_LINES, -1);
    return;
  }

  // Snapshots are stored as JSONL (append-only) to support time-series features:
  // movers radar, watchlist alerts, per-market timeline, and minimal backtests.
  const dir = getLocalDataDir();
  await ensureDir(dir);
  const p = getSnapshotsPath();
  await fs.appendFile(p, `${JSON.stringify(line)}\n`, "utf8");
}

function asSnapshotLine(v: unknown): SnapshotLine | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.t !== "string") return null;
  if (!Array.isArray(o.markets)) return null;

  const markets: SnapshotMarket[] = [];
  for (const m of o.markets) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    if (typeof mm.slug !== "string" || mm.slug.length === 0) continue;

    const liquidity =
      typeof mm.liquidity === "number" && Number.isFinite(mm.liquidity) ? (mm.liquidity as number) : null;
    const volume24hr =
      typeof mm.volume24hr === "number" && Number.isFinite(mm.volume24hr) ? (mm.volume24hr as number) : null;

    const outcomesRaw = Array.isArray(mm.outcomes) ? (mm.outcomes as unknown[]) : [];
    const outcomes: SnapshotOutcome[] = [];
    for (const oo of outcomesRaw) {
      if (!oo || typeof oo !== "object") continue;
      const ooo = oo as Record<string, unknown>;
      if (typeof ooo.name !== "string") continue;
      const price = typeof ooo.price === "number" && Number.isFinite(ooo.price) ? (ooo.price as number) : null;
      outcomes.push({ name: ooo.name, price });
    }

    markets.push({ slug: mm.slug, liquidity, volume24hr, outcomes });
  }

  return { t: o.t, markets };
}

export async function readSnapshotLines(options: { maxLines?: number } = {}): Promise<SnapshotLine[]> {
  // Reads the tail of snapshots.jsonl. This is intentionally bounded to keep page renders fast.
  const maxLines = Math.max(1, options.maxLines ?? 50);

  const kv = await getKvClient();
  if (kv) {
    try {
      const all = await kv.lrange<string>(KV_SNAPSHOTS_KEY, 0, -1);
      const tail = all.slice(Math.max(0, all.length - maxLines));
      const out: SnapshotLine[] = [];
      for (const line of tail) {
        if (typeof line !== "string") continue;
        try {
          const parsed = JSON.parse(line) as unknown;
          const snap = asSnapshotLine(parsed);
          if (snap) out.push(snap);
        } catch {
          continue;
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  try {
    const raw = await fs.readFile(getSnapshotsPath(), "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - maxLines));
    const out: SnapshotLine[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line) as unknown;
        const snap = asSnapshotLine(parsed);
        if (snap) out.push(snap);
      } catch {
        continue;
      }
    }
    return out;
  } catch {
    return [];
  }
}
