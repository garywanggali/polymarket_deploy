import { NextResponse } from "next/server";

import { readMarketIndex, readSnapshotLines } from "@/lib/store";

export const runtime = "nodejs";

function toInt(v: string | null, fallback: number) {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getYesPrice(outcomes: { name: string; price: number | null }[]) {
  const yes = outcomes.find((o) => o.name.toLowerCase() === "yes");
  if (yes && typeof yes.price === "number") return yes.price;
  const first = outcomes.find((o) => typeof o.price === "number");
  return first?.price ?? null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const tag = (url.searchParams.get("tag") ?? "").trim();
  const signal = (url.searchParams.get("signal") ?? "").trim();
  const sort = (url.searchParams.get("sort") ?? "volume24hr").trim();
  const limit = Math.min(500, Math.max(1, toInt(url.searchParams.get("limit"), 100)));
  const slugsRaw = (url.searchParams.get("slugs") ?? "").trim();
  const withMoves = (url.searchParams.get("withMoves") ?? "").trim() === "1";

  const index = await readMarketIndex();
  if (!index) {
    return NextResponse.json(
      { updatedAt: null, count: 0, markets: [], hint: "先 POST /api/ingest 抓取数据" },
      { status: 200 },
    );
  }

  let markets = index.markets;

  if (slugsRaw) {
    const allow = new Set(
      slugsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    markets = markets.filter((m) => allow.has(m.slug));
  }

  if (q) {
    markets = markets.filter((m) => m.title.toLowerCase().includes(q));
  }

  if (tag) {
    markets = markets.filter((m) => m.tags.includes(tag));
  }

  if (signal) {
    markets = markets.filter((m) => m.signals.includes(signal));
  }

  const byNum = (key: "volume24hr" | "liquidity") => (a: typeof markets[number], b: typeof markets[number]) =>
    (b[key] ?? 0) - (a[key] ?? 0);

  if (sort === "liquidity") markets = [...markets].sort(byNum("liquidity"));
  else if (sort === "volume24hr") markets = [...markets].sort(byNum("volume24hr"));
  else if (sort === "endDate") {
    markets = [...markets].sort((a, b) => {
      const ams = a.endDate ? Date.parse(a.endDate) : Number.POSITIVE_INFINITY;
      const bms = b.endDate ? Date.parse(b.endDate) : Number.POSITIVE_INFINITY;
      return ams - bms;
    });
  }

  const sliced = markets.slice(0, limit);

  if (!withMoves) {
    return NextResponse.json({
      updatedAt: index.updatedAt,
      count: markets.length,
      markets: sliced,
    });
  }

  const snaps = await readSnapshotLines({ maxLines: 2 });
  const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
  const last = snaps.length >= 1 ? snaps[snaps.length - 1] : null;
  const prevMap = new Map((prev?.markets ?? []).map((m) => [m.slug, m] as const));
  const lastMap = new Map((last?.markets ?? []).map((m) => [m.slug, m] as const));

  const dtMinutes =
    prev && last ? Math.max(1 / 60, (Date.parse(last.t) - Date.parse(prev.t)) / (1000 * 60)) : null;

  const marketsWithMoves = sliced.map((m) => {
    const smLast = lastMap.get(m.slug) ?? null;
    const smPrev = prevMap.get(m.slug) ?? null;
    const price = smLast ? getYesPrice(smLast.outcomes) : null;
    const prevPrice = smPrev ? getYesPrice(smPrev.outcomes) : null;
    const move = price !== null && prevPrice !== null ? price - prevPrice : null;
    return {
      ...m,
      snapshot: {
        t: last?.t ?? null,
        prevT: prev?.t ?? null,
        dtMinutes,
        price,
        prevPrice,
        move,
        absMove: move === null ? null : Math.abs(move),
        liquidity: smLast?.liquidity ?? null,
        volume24hr: smLast?.volume24hr ?? null,
      },
    };
  });

  return NextResponse.json({
    updatedAt: index.updatedAt,
    snapshot: { t: last?.t ?? null, prevT: prev?.t ?? null, dtMinutes },
    count: markets.length,
    markets: marketsWithMoves,
  });
}
