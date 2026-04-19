export const WATCHLIST_KEY = "pm_watchlist_v1";

export function readWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const slugs = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    return Array.from(new Set(slugs));
  } catch {
    return [];
  }
}

export function writeWatchlist(slugs: string[]) {
  if (typeof window === "undefined") return;
  const uniq = Array.from(new Set(slugs)).filter((s) => typeof s === "string" && s.length > 0);
  window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(uniq));
  window.dispatchEvent(new Event("pm_watchlist"));
}

export function isWatched(slug: string) {
  return readWatchlist().includes(slug);
}

export function toggleWatch(slug: string) {
  const list = readWatchlist();
  if (list.includes(slug)) writeWatchlist(list.filter((s) => s !== slug));
  else writeWatchlist([...list, slug]);
}

