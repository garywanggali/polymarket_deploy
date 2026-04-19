import type { NormalizedMarket } from "./types";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAny(haystack: string, needles: string[]) {
  const lowered = haystack.toLowerCase();
  return needles.some((n) => {
    const needle = n.toLowerCase();
    if (needle.length <= 4 && /^[a-z0-9]+$/.test(needle)) {
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
      return re.test(haystack);
    }
    return lowered.includes(needle);
  });
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

function parseDateMs(iso: string | null) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

function includesRe(haystack: string, re: RegExp) {
  return re.test(haystack);
}

export function classifyMarket(market: NormalizedMarket, nowMs = Date.now()) {
  const text = `${market.title}\n${market.description ?? ""}`.trim();

  const tags: string[] = [];
  const signals: string[] = [];

  if (
    includesAny(text, [
      "btc",
      "bitcoin",
      "eth",
      "ethereum",
      "sol",
      "solana",
      "crypto",
      "defi",
      "mstr",
      "microstrategy",
      "stablecoin",
    ])
  ) {
    tags.push("加密");
  }

  if (
    includesAny(text, [
      "fed",
      "cpi",
      "inflation",
      "interest rate",
      "rate hike",
      "rate cut",
      "unemployment",
      "gdp",
      "recession",
    ])
  ) {
    tags.push("宏观");
  }

  if (
    includesAny(text, [
      "election",
      "president",
      "senate",
      "house",
      "trump",
      "biden",
      "democrat",
      "republican",
      "prime minister",
      "parliament",
      "polls",
    ])
  ) {
    tags.push("政治");
  }

  const isSports =
    includesAny(text, [
      "nba",
      "nfl",
      "mlb",
      "nhl",
      "uefa",
      "europa league",
      "uel",
      "champions league",
      "premier league",
      "ucl",
      "la liga",
      "serie a",
      "bundesliga",
      "ligue 1",
      "mls",
      "fifa",
      "soccer",
      "football",
      "ufc",
      "f1",
      "formula 1",
      "world cup",
      "wimbledon",
    ]);

  if (isSports) {
    tags.push("体育");

    if (includesAny(text, ["world cup", "fifa world cup"])) tags.push("体育/世界杯");
    if (includesRe(text, /\buefa\s+euro\b/i) || includesRe(text, /\beuro\s*20\d{2}\b/i) || includesRe(text, /\beuropean\s+championship\b/i))
      tags.push("体育/欧洲杯");
    if (includesAny(text, ["champions league", "uefa champions league", "ucl"])) tags.push("体育/欧冠");
    if (includesAny(text, ["europa league", "uefa europa league", "uel"])) tags.push("体育/欧联");
    if (includesAny(text, ["premier league"])) tags.push("体育/英超");
    if (includesAny(text, ["la liga"])) tags.push("体育/西甲");
    if (includesAny(text, ["serie a"])) tags.push("体育/意甲");
    if (includesAny(text, ["bundesliga"])) tags.push("体育/德甲");
    if (includesAny(text, ["ligue 1"])) tags.push("体育/法甲");
    if (includesAny(text, ["nba"])) tags.push("体育/NBA");
    if (includesAny(text, ["nfl"])) tags.push("体育/NFL");
    if (includesAny(text, ["mlb"])) tags.push("体育/MLB");
    if (includesAny(text, ["nhl"])) tags.push("体育/NHL");
    if (includesAny(text, ["ufc"])) tags.push("体育/UFC");
    if (includesAny(text, ["formula 1", "f1"])) tags.push("体育/F1");
    if (includesAny(text, ["wimbledon"])) tags.push("体育/网球");

    if (
      includesAny(text, [
        "allegation",
        "allegations",
        "controversy",
        "scandal",
        "affair",
        "lawsuit",
        "charged",
        "arrest",
        "ban",
        "banned",
        "suspension",
        "suspended",
        "doping",
        "injury",
        "injured",
        "transfer",
        "rumor",
        "rumours",
      ])
    ) {
      tags.push("体育/花边新闻");
    }

    if (
      includesAny(text, [
        "world cup",
        "uefa",
        "champions league",
        "europa league",
        "euro cup",
        "uefa euro",
        "european championship",
      ]) ||
      /\b20\d{2}[-–]\d{2}\b/.test(text)
    ) {
      signals.push("周期性赛事");
    }
  }

  if (includesAny(text, ["openai", "nvidia", "tsla", "tesla", "apple", "google", "meta", "microsoft"])) {
    tags.push("科技");
  }

  const endMs = parseDateMs(market.endDate);
  if (endMs !== null && endMs > nowMs) {
    const hoursLeft = (endMs - nowMs) / 3_600_000;
    if (hoursLeft <= 24) signals.push("临近截止(<24h)");
    if (hoursLeft <= 6) signals.push("临近截止(<6h)");
  }

  if (market.liquidity !== null) {
    if (market.liquidity < 10_000) signals.push("低流动性(<10k)");
    if (market.liquidity >= 100_000) signals.push("高流动性(>=100k)");
  }

  if (market.volume24hr !== null) {
    if (market.volume24hr >= 100_000) signals.push("高交易量(24h>=100k)");
  }

  const maxProb =
    market.outcomes.length > 0
      ? Math.max(...market.outcomes.map((o) => (o.price === null ? 0 : o.price)))
      : null;
  if (maxProb !== null) {
    if (maxProb >= 0.9) signals.push("单边概率(>=0.9)");
    if (maxProb >= 0.98) signals.push("单边概率(>=0.98)");
  }

  return {
    tags: uniq([...market.tags, ...tags]),
    signals: uniq(signals),
  };
}
