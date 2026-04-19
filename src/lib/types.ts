export type MarketOutcome = {
  name: string;
  price: number | null;
};

export type NormalizedMarket = {
  slug: string;
  eventSlug: string | null;
  title: string;
  description: string | null;
  image: string | null;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string | null;
  active: boolean | null;
  closed: boolean | null;
  volume24hr: number | null;
  volume: number | null;
  liquidity: number | null;
  outcomes: MarketOutcome[];
  tags: string[];
  signals: string[];
};

export type MarketIndex = {
  updatedAt: string;
  source: {
    baseUrl: string;
    endpoint: string;
    params: Record<string, string | number | boolean>;
  };
  count: number;
  markets: NormalizedMarket[];
};

export type IngestSummary = {
  updatedAt: string;
  eventsFetched: number;
  marketsFetched: number;
  marketsWritten: number;
};
