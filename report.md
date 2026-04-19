# PA! Web Scraping Data Service Project Report

Project: Polymarket Opportunity Radar (Data Service Web App)

Author: <YOUR_NAME>

Date: <YYYY-MM-DD>

Live Deployment: <YOUR_DEPLOYMENT_URL>

GitHub Repository: https://github.com/garywanggali/polymarket

Demo Video (3–5 min): <YOUR_VIDEO_LINK>

Project Report PDF: <YOUR_REPORT_PDF_LINK_OR_FILE>

## 1. Background / Problem Statement

Prediction markets update in real time and contain thousands of markets. Users face an information gap:

- It is hard to notice meaningful price movement early across thousands of markets.
- Many apparent “moves” are noise (thin liquidity, low-volume manipulation, near-expiry volatility).
- Without historical snapshots, users cannot validate whether a signal has any statistical edge.

Goal: build a web app that retrieves external data, cleans/normalizes it, stores time-series snapshots, and presents value-added features that help users make faster and higher-quality decisions.

## 2. Data Sources

Primary source (external data retrieval):

- Polymarket Gamma API
  - Base URL: `https://gamma-api.polymarket.com`
  - Endpoint used: `/events`

Key fields used:

- Market identity: `slug`, `title`, `eventSlug`
- Market state: `liquidity`, `volume24hr`, `outcomes[].price`
- Time information: `endDate` (near-expiry warnings)

## 3. Compliance & Ethics

This project is designed to be responsible and safe:

- Data access method:
  - Uses a public API endpoint rather than scraping HTML pages.
- Load protection (rate limiting / safety):
  - Timeouts via `AbortController` to prevent hanging connections.
  - Limited retries (3 attempts) with exponential backoff + jitter to reduce upstream pressure.
  - Ingest job is user-triggered and bounded by:
    - `pageLimit` (pagination size)
    - `maxEvents` (maximum items)
    - `maxMs` (maximum runtime per ingest)
- Privacy & ethics:
  - Does not collect personal data.
  - Stores only market-level public data needed for the service.
- Security:
  - No API keys are hardcoded.
  - Secrets are read from environment variables (e.g., `.env.local`) and excluded from git.

Robots/ToS note:

- robots.txt typically applies to web crawlers accessing HTML pages; this project calls an API endpoint.
- Regardless of robots scope, the implementation still applies safe retry/time limits and avoids aggressive request patterns.

## 4. Technical Solution & Architecture

### 4.1 Tech Stack

- Next.js (App Router) + React + TypeScript
- Node.js runtime for API routes
- Local persistence for demo: `.local-data/`

### 4.2 System Architecture

**(1) Ingest pipeline**

- Trigger: user clicks “更新最新盘口”
- Route: `POST /api/ingest`
- Steps:
  1. Paginate `/events` from Gamma API
  2. Normalize events → markets
  3. Add classification tags/signals (risk, category, near-expiry, etc.)
  4. Persist:
     - Latest market index: `.local-data/markets.json`
     - Snapshot history: `.local-data/snapshots.jsonl` (append-only)

**(2) UI / Value-added processing**

- Homepage:
  - Movers radar: Δp between the latest two snapshots
  - Event consistency pill: whether multiple markets under the same event move together
  - Executability labels: liquidity tiers, near-expiry, one-sided probability hints
  - Market directory with filters
- Watchlist:
  - User subscribes to markets
  - “alerts” panel shows sudden moves only on subscribed markets
- Market details:
  - Snapshot timeline table (p, Δp, volume acceleration, liquidity)
  - Sparkline charts for p / volume / liquidity / volume acceleration / quality score
  - Event peer comparison table (same event, last two snapshots)
  - Minimal backtest lab with adjustable parameters

**(3) Optional AI analysis**

- If configured, server calls DeepSeek `chat/completions` to generate a structured summary.
- Keys are loaded from env vars; not exposed in client code.

## 5. Implementation Results (Screenshots & Explanations)

Replace placeholders with real screenshots:

1) Homepage (hero + movers radar)

- Screenshot: <INSERT_SCREENSHOT>
- What it demonstrates:
  - UpdatedAt changes after ingest
  - Movers cards show Δp, liquidity, volume, event consistency, and executability labels

2) Movers card labels (quality and risk)

- Screenshot: <INSERT_SCREENSHOT>
- What it demonstrates:
  - Event consistency ratio helps filter noise
  - Liquidity tiers and near-expiry flags inform executability

3) Market detail page: snapshot timeline + sparklines

- Screenshot: <INSERT_SCREENSHOT>
- What it demonstrates:
  - Time-series value from snapshots: p(t), Δp(t), volume acceleration, liquidity changes

4) Market detail page: minimal backtest lab (adjustable)

- Screenshot: <INSERT_SCREENSHOT>
- What it demonstrates:
  - Signal evaluation with thresholds and holding periods
  - Filters based on minimum liquidity and quality score

5) Watchlist alerts panel

- Screenshot: <INSERT_SCREENSHOT>
- What it demonstrates:
  - “Radar” behavior on subscribed markets
  - Threshold controls for min |Δp| and min liquidity

6) Geo view

- Screenshot: <INSERT_SCREENSHOT>
- What it demonstrates:
  - Aggregation by country and click-to-drill

## 6. Core Value-added Features (Why the scraping/service matters)

### 6.1 Movers Radar (Δp)

Instead of a single snapshot, the app compares two snapshots:

- `Δp = p(last) - p(prev)`
- `|Δp|` highlights meaningful moves
- Adds context:
  - liquidity and volume acceleration (volume confirmation)

### 6.2 Event Consistency

A move is higher quality if multiple markets under the same event move together:

- Detects “theme-level” movement
- Reduces false positives from single-market noise

### 6.3 Executability Labels

The UI highlights whether the move is practically tradable:

- Liquidity tiers: thin markets have higher slippage risk
- Near-expiry warnings: volatility and settlement sensitivity
- One-sided probability: chasing can have poor risk/reward

### 6.4 Watchlist Alerts

Converts the app from “dashboard” → “radar”:

- Users see sudden changes only for subscribed markets
- Helps gain time advantage when scanning large market sets

### 6.5 Market Detail: Time-series + Quality Score

The market page adds professional diagnostics:

- Sparkline charts for p/volume/liquidity/volume acceleration
- A quality score (0–1) combining:
  - Liquidity tier
  - Volume confirmation strength
  - Event consistency ratio

### 6.6 Minimal Backtest Lab (Per-market)

Purpose: verify whether a simple signal may have edge, using snapshot history.

- Signal trigger: `|Δp| ≥ threshold`
- Strategy (mean reversion): if price moved up, go short; if moved down, go long
- Exit: after N snapshots
- Includes a conservative cost penalty proxy based on liquidity (execution cost approximation)

## 7. Demonstration Video (3–5 min) Checklist

Suggested flow:

1) Show homepage and explain the problem (information gap).
2) Click “更新最新盘口” (demonstrate that external data updates).
3) Explain movers radar:
   - Δp, volume acceleration, liquidity, event consistency, executability labels
4) Open one market detail page:
   - Sparkline charts + snapshot table
   - Event peer comparison table
   - Minimal backtest lab and adjust parameters
5) Open watchlist:
   - Add/remove a market
   - Show alerts panel and thresholds
6) Optional: geo page click-to-drill
7) Close with limitations and future work.

## 8. Limitations

- Snapshot resolution depends on ingestion frequency; sparse snapshots reduce signal reliability.
- Liquidity-based cost model is only an approximation; true slippage needs order book depth.
- Local file storage is suitable for demo; production deployment should use persistent storage.
- AI analysis depends on external API availability and network conditions.

## 9. Future Improvements

- Persistent database for snapshots and long-term history.
- Better anomaly detection (robust statistics, event clustering).
- True execution cost modeling if order book depth becomes available.
- Real-time push alerts (WebSocket or server-sent events).
- Admin rate limiting and caching layers for safe public deployment.

## Appendix: Export to PDF

- Option A: Use a Markdown-to-PDF tool in your editor to export this file.
- Option B: Render this Markdown and print-to-PDF from the browser.
