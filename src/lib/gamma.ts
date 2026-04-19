const DEFAULT_BASE_URL = "https://gamma-api.polymarket.com";

export type GammaFetchOptions = {
  baseUrl?: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
};

function withQuery(url: URL, query: GammaFetchOptions["query"]) {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
}

async function fetchWithRetry(url: string, init: RequestInit, attempts: number) {
  // External data source protection:
  // - Limit attempts
  // - Exponential backoff + jitter
  // This reduces load and avoids hammering the upstream API.
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gamma API error ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
      }
      return res;
    } catch (err) {
      lastError = err;
      const sleepMs = 250 * Math.pow(2, i) + Math.floor(Math.random() * 150);
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }
  const message =
    lastError && typeof lastError === "object" && "message" in lastError && typeof (lastError as { message?: unknown }).message === "string"
      ? (lastError as { message: string }).message
      : "Gamma API request failed";
  throw new Error(message, { cause: lastError });
}

export async function gammaFetchJson<T>(options: GammaFetchOptions): Promise<T> {
  // Single entry point for Gamma API calls:
  // - Timeout via AbortController
  // - Retry wrapper via fetchWithRetry
  const timeoutMs = options.timeoutMs ?? 25_000;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const url = new URL(options.path, baseUrl);
  withQuery(url, options.query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithRetry(
      url.toString(),
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      },
      3,
    );
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getGammaBaseUrl() {
  return DEFAULT_BASE_URL;
}
