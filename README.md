# PA! Web Scraping Data Service Project — Polymarket Opportunity Radar

This project is a data service web app that retrieves external market data (Polymarket Gamma API), cleans/normalizes it, builds time-series snapshots, and turns it into actionable UI features: movers radar, event-consistency signals, watchlist alerts, and per-market timeline/backtest views.

## Live Links (Fill These Before Submission)

- Live Deployment: <YOUR_DEPLOYMENT_URL>
- GitHub Repository: https://github.com/garywanggali/polymarket
- Demo Video (3–5 min): <YOUR_VIDEO_LINK>
- Project Report PDF: <YOUR_REPORT_PDF_LINK_OR_FILE>

## Features

- Data ingest (external data retrieval): one-click update to fetch latest markets and store a local index + snapshot history.
- Movers radar: highlights markets with recent meaningful price changes (Δp) and shows liquidity/volume context.
- Event consistency: detects whether multiple markets under the same event move in the same direction (helps filter noise).
- Executability labels: liquidity tiers, near-expiry warnings, one-sided probability hints.
- Watchlist + alerts: track your favorite markets and surface sudden moves on only those markets.
- Market details: snapshot timeline (p, Δp, volume acceleration) + minimal backtest lab on that market’s historical snapshots.
- Geo view: country-level aggregation and click-to-drill details.
- Optional AI analysis (DeepSeek): generates structured recommendations based on current movers.

## Tech Stack

- Next.js (App Router) + React + TypeScript
- Server routes: `/api/ingest`, `/api/markets`, `/api/markets/[slug]`
- Local storage: `.local-data/markets.json` + `.local-data/snapshots.jsonl`

## Data Source

- Polymarket Gamma API (events + markets data)
  - Base URL: `https://gamma-api.polymarket.com`
  - Endpoint used: `/events`

## Setup

### 1) Install

```bash
npm install
```

### 2) Environment Variables

Create `.env.local` (it is ignored by git via `.gitignore`):

```bash
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_TIMEOUT_MS=45000
DEEPSEEK_RETRIES=1
```

Security note: never commit API keys. If you ever exposed a key, revoke it and create a new one.

### 3) Run Dev

```bash
npm run dev
```

Open: `http://localhost:3000`

### 4) Fetch/Update Data

On the homepage, click:

- “更新最新盘口”

This triggers `POST /api/ingest`, which fetches external data and writes:

- `.local-data/markets.json`
- `.local-data/snapshots.jsonl`

You need at least 2 snapshots to compute Δp and power movers/alerts.

## Deploy (Vercel)

1) Push this repository to GitHub (public).
2) Import into Vercel.
3) Configure environment variables in Vercel Project Settings:
   - `DEEPSEEK_API_KEY` (optional, only if you want AI)
   - `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_TIMEOUT_MS`, `DEEPSEEK_RETRIES` (optional)
4) Deploy and copy the deployment URL into the “Live Links” section above.

Notes:
- `.local-data/` is local-only and is ignored by git. In a cloud deployment, you should treat storage as ephemeral unless you attach persistent storage. For the assignment demo, it’s acceptable to show live fetch + in-memory behavior, or trigger ingest at runtime during the demo.

## Demo Video (3–5 min) Recording Script

Recommended flow:

1) Open homepage, introduce the problem: market info updates fast; need signals from scraped data.
2) Click “更新最新盘口” and show data updates (updatedAt, movers list changes).
3) Show “最近动得最明显的市场”: explain Δp, event consistency, executability labels.
4) Open one market detail page:
   - Show snapshot timeline
   - Show minimal backtest lab table
5) Open Watchlist:
   - Add a market to watchlist from homepage
   - Show “异动提醒” panel and how thresholds work
6) (Optional) Show geo page click-to-drill
7) Conclude with limitations + next improvements.

## Project Report (PDF)

The report should include:

- Background + problem statement
- Data source description (Gamma API)
- Compliance & ethics (rate limiting, safe retries, data usage)
- Architecture + implementation
- Screenshots + results
- Reflection + future work

This repo includes a report source file you can export to PDF:

- `report.md` → Export to PDF via your editor (VS Code “Markdown PDF”), or print-to-PDF from a rendered view.

## Scripts

```bash
npm run lint
npm run build
npm run start
```
