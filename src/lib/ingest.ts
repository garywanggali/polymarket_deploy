import { gammaFetchJson, getGammaBaseUrl } from "./gamma";
import { classifyMarket } from "./classify";
import { normalizeEventToMarkets } from "./normalize";
import { appendSnapshotLine, writeMarketIndex } from "./store";
import type { IngestSummary, MarketIndex, NormalizedMarket } from "./types";

type IngestOptions = {
  maxEvents?: number;
  pageLimit?: number;
  order?: string;
  active?: boolean;
  closed?: boolean;
  maxMs?: number;
};

export async function ingestGammaEvents(options: IngestOptions = {}): Promise<IngestSummary> {
  // Ingest pipeline:
  // 1) paginate Gamma /events
  // 2) normalize event→markets
  // 3) classify tags/signals
  // 4) write latest index + append a snapshot line for time-series features
  const updatedAt = new Date().toISOString();
  const pageLimit = options.pageLimit ?? 200;
  const maxEvents = options.maxEvents ?? 5000;
  const order = options.order ?? "volume_24hr";
  const active = options.active ?? true;
  const closed = options.closed ?? false;
  const maxMs = options.maxMs ?? 60_000;

  let offset = 0;
  let eventsFetched = 0;
  let marketsFetched = 0;
  const startedAtMs = Date.now();

  const marketBySlug = new Map<string, NormalizedMarket>();

  while (eventsFetched < maxEvents && Date.now() - startedAtMs < maxMs) {
    // Time + count limits prevent runaway jobs during demos/deployments.
    const page = await gammaFetchJson<unknown[]>({
      path: "/events",
      query: {
        active,
        closed,
        limit: pageLimit,
        offset,
        order,
        ascending: false,
      },
    });

    if (!Array.isArray(page) || page.length === 0) break;

    eventsFetched += page.length;
    offset += page.length;

    for (const e of page) {
      const markets = normalizeEventToMarkets(e);
      marketsFetched += markets.length;
      for (const m of markets) {
        const existing = marketBySlug.get(m.slug);
        if (!existing) marketBySlug.set(m.slug, m);
      }
    }

    if (page.length < pageLimit) break;
  }

  const markets = Array.from(marketBySlug.values()).map((m) => {
    const { tags, signals } = classifyMarket(m);
    return { ...m, tags, signals };
  });

  markets.sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0));

  const index: MarketIndex = {
    updatedAt,
    source: {
      baseUrl: getGammaBaseUrl(),
      endpoint: "/events",
      params: {
        active,
        closed,
        limit: pageLimit,
        order,
        ascending: false,
        maxEvents,
        maxMs,
      },
    },
    count: markets.length,
    markets,
  };

  await writeMarketIndex(index);

  const snapshotTopN = 1000;
  await appendSnapshotLine({
    t: updatedAt,
    markets: markets.slice(0, snapshotTopN).map((m) => ({
      slug: m.slug,
      liquidity: m.liquidity,
      volume24hr: m.volume24hr,
      outcomes: m.outcomes.map((o) => ({ name: o.name, price: o.price })),
    })),
  });

  return {
    updatedAt,
    eventsFetched,
    marketsFetched,
    marketsWritten: markets.length,
  };
}
