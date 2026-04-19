# PA! Web Scraping Data Service Project Report (Source)

Project: Polymarket Opportunity Radar (Next.js)

Author: <YOUR_NAME>

Date: <YYYY-MM-DD>

## 1. Background / Problem Statement

Prediction markets move quickly and contain thousands of markets. Users often face an information gap:

- Important markets can change price rapidly, but it is hard to notice early.
- Many “moves” are noise (thin liquidity, manipulation, near-expiry volatility).
- Without historical snapshots, users cannot validate whether a signal has any edge.

This project builds a web app that retrieves external market data, processes it into time-series snapshots, and provides actionable “edge-oriented” views:

- Movers radar with quality filters
- Event-level consistency signals
- Watchlist alerts for subscribed markets
- Per-market timeline and minimal backtest lab for signal verification

## 2. Data Sources

Primary source:

- Polymarket Gamma API
  - Base URL: `https://gamma-api.polymarket.com`
  - Endpoint: `/events`

Data fields used (examples):

- Market: slug, title, endDate, liquidity, volume24hr, outcomes (name, price)
- Event grouping: eventSlug (used for event-level aggregation)

## 3. Compliance & Ethics

This project focuses on responsible data usage:

- Uses a public API endpoint rather than scraping HTML pages.
- Implements retry with exponential backoff and timeouts to reduce load:
  - Requests have a timeout (`AbortController`)
  - Retries limited to 3 attempts with exponential backoff and jitter
- Ingestion is user-triggered (button) and also has limits:
  - Page limit, max events, max runtime (maxMs) to avoid runaway fetch
- Does not store or expose private user data.
- Does not hardcode secrets:
  - API keys are read from environment variables (`.env.local`) and excluded from git.

Notes for the report reviewer:

- robots.txt typically governs crawling HTML pages; this project calls an API endpoint. We still apply rate limiting and safe retry policies.
- If deploying publicly, consider adding stronger server-side rate limiting and caching to avoid abuse.

## 4. Technical Solution & Architecture

### 4.1 Tech Stack

- Next.js (App Router) + React + TypeScript
- Node.js runtime for API routes
- Local persistence (for development/demo): `.local-data/`

### 4.2 High-level Architecture

1) Ingest

- User clicks “更新最新盘口”
- `POST /api/ingest` triggers a server-side ingestion job
- Fetches `/events` from Gamma API with pagination
- Normalizes events into markets, adds classification tags/signals
- Writes:
  - `markets.json` (latest index)
  - `snapshots.jsonl` (append-only snapshot history)

2) Serving & UI

- Homepage renders:
  - Hero + movers radar (Δp between latest two snapshots)
  - Event consistency label and executability labels
  - Market directory with filters
- Market details page renders:
  - Snapshot timeline table (p, Δp, volume acceleration, liquidity)
  - Event consistency summary
  - Minimal backtest lab (mean reversion strategy)
- Watchlist page renders:
  - subscribed markets + “alerts” panel based on snapshot moves

3) Optional AI analysis

- If configured, calls DeepSeek `chat/completions` on the server
- Uses environment variables for API key and base URL

## 5. Implementation Results (Screenshots)

Insert screenshots here (placeholders):

- Homepage hero + movers radar: <INSERT_SCREENSHOT>
- Movers card labels (event consistency + executability): <INSERT_SCREENSHOT>
- Market detail snapshot timeline: <INSERT_SCREENSHOT>
- Market detail minimal backtest lab: <INSERT_SCREENSHOT>
- Watchlist alerts panel: <INSERT_SCREENSHOT>
- Geo page: <INSERT_SCREENSHOT>

## 6. Core Value-added Features (What the scraping enables)

### 6.1 Movers Radar

- Computes Δp using snapshot history rather than single-point values.
- Displays liquidity and volume context to reduce noise.

### 6.2 Event Consistency

- Aggregates multiple markets under the same event to detect “theme-level” moves.
- Helps distinguish real information-driven moves from isolated noise.

### 6.3 Executability Labels

- Liquidity tiers, near-expiry warnings, one-sided probability hints.
- Helps users avoid low-quality trades.

### 6.4 Watchlist Alerts

- Converts data service into a “radar”: users see sudden changes only on subscribed markets.

### 6.5 Minimal Backtest Lab

- Uses historical snapshots to test whether a simple signal has positive expectation.
- Includes a conservative cost penalty proxy based on liquidity.

## 7. Limitations

- Snapshot resolution depends on ingestion frequency; sparse snapshots reduce signal quality.
- Liquidity-based cost model is only an approximation; true slippage requires order book depth.
- Local file storage is suitable for demo; production deployment should use persistent storage (DB/object store).
- AI analysis depends on external API availability and network conditions.

## 8. Future Improvements

- Persistent database for snapshots and long-term history.
- Better anomaly detection (robust statistics, event clustering).
- True execution cost modeling if order book depth becomes available.
- Real-time push alerts (WebSocket or server-sent events).
- Admin rate limiting and caching layers for safe public deployment.

## 9. Appendix: How to Export This Report to PDF

Option A (VS Code):

- Install a Markdown-to-PDF extension and export `report.md` to `report.pdf`.

Option B (Browser print):

- View `report.md` rendered (e.g., GitHub preview) and print-to-PDF.

