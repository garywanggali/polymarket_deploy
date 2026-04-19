import type { NormalizedMarket } from "./types";

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function parseJsonIfString<T>(v: unknown): T | null {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  const parsed = parseJsonIfString<unknown>(v);
  if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed as string[];
  return [];
}

function asTagNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const names = v
    .map((t) => {
      if (typeof t === "string") return t;
      if (t && typeof t === "object" && "name" in t && typeof (t as { name?: unknown }).name === "string") {
        return (t as { name: string }).name;
      }
      return null;
    })
    .filter((x): x is string => Boolean(x));
  return Array.from(new Set(names));
}

export function normalizeEventToMarkets(event: unknown): NormalizedMarket[] {
  if (!event || typeof event !== "object") return [];

  const e = event as Record<string, unknown>;
  const eventSlug = toStringOrNull(e.slug);
  const eventTitle = toStringOrNull(e.title) ?? "Untitled";
  const eventDescription = toStringOrNull(e.description);
  const eventImage = toStringOrNull(e.image) ?? toStringOrNull(e.icon);
  const eventStartDate = toStringOrNull(e.startDate) ?? toStringOrNull(e.creationDate);
  const eventEndDate = toStringOrNull(e.endDate);
  const eventUpdatedAt = toStringOrNull(e.updatedAt);
  const eventActive = typeof e.active === "boolean" ? e.active : null;
  const eventClosed = typeof e.closed === "boolean" ? e.closed : null;
  const eventCountryName = toStringOrNull(e.countryName);
  const eventTags = Array.from(new Set([...asTagNames(e.tags), ...(eventCountryName ? [eventCountryName] : [])]));

  const marketsRaw = e.markets;
  if (!Array.isArray(marketsRaw)) return [];

  const out: NormalizedMarket[] = [];
  for (const marketRaw of marketsRaw) {
    if (!marketRaw || typeof marketRaw !== "object") continue;
    const m = marketRaw as Record<string, unknown>;

    const slug = toStringOrNull(m.slug) ?? eventSlug ?? null;
    if (!slug) continue;

    const marketTitle = toStringOrNull(m.question) ?? toStringOrNull(m.title) ?? eventTitle;
    const marketDescription = toStringOrNull(m.description) ?? eventDescription;
    const image = toStringOrNull(m.image) ?? toStringOrNull(m.icon) ?? eventImage;
    const startDate = toStringOrNull(m.startDate) ?? eventStartDate;
    const endDate = toStringOrNull(m.endDate) ?? eventEndDate;
    const updatedAt = toStringOrNull(m.updatedAt) ?? eventUpdatedAt;
    const active = typeof m.active === "boolean" ? m.active : eventActive;
    const closed = typeof m.closed === "boolean" ? m.closed : eventClosed;

    const outcomes = asStringArray(m.outcomes);
    const outcomePricesRaw = asStringArray(m.outcomePrices);
    const prices = outcomePricesRaw.map((p) => toNumberOrNull(p));

    const outcomeObjects = outcomes.map((name, idx) => ({
      name,
      price: prices[idx] ?? null,
    }));

    const volume24hr = toNumberOrNull(m.volume24hr) ?? toNumberOrNull(e.volume24hr);
    const volume = toNumberOrNull(m.volumeNum) ?? toNumberOrNull(m.volume) ?? toNumberOrNull(e.volume);
    const liquidity = toNumberOrNull(m.liquidity) ?? toNumberOrNull(e.liquidity);

    out.push({
      slug,
      eventSlug,
      title: marketTitle,
      description: marketDescription,
      image,
      startDate,
      endDate,
      updatedAt,
      active,
      closed,
      volume24hr,
      volume,
      liquidity,
      outcomes: outcomeObjects,
      tags: eventTags,
      signals: [],
    });
  }
  return out;
}
