# PulseDesk — Always-On Desktop Finance Cockpit

> **Free · no login · nothing stored on a server.** Created by **Dheerav Tandon**.
>
> 📱 **Use it now:** <https://dheeravtandon.github.io/pulsedesk/> — open on your phone and tap *Add to Home Screen*
> 💻 **Windows app:** <https://github.com/dheeravtandon/pulsedesk/releases/latest>

**Document ID:** PD-HB-001 · **Version:** 1.0 · **Date:** 2026-08-01 · **Prepared by:** Dheerav Tandon
**Status:** Living · **Classification:** Internal
**Related:** PD-CHR-001 (Charter), PD-PMP-001 (PMP), PD-RTM-001 (RTM), PD-SDD-001 (Design), PD-CR-001 (Code Register), PD-RSK-001 (Risk), PD-TL-001 (Timeline), PD-DPDP-001 (Compliance), PD-DRP-001 (Retention)

---

## What it is

A frameless, always-on-top Electron widget that keeps one screen of live market context permanently in view: the five most-hyped stocks, your portfolio P&L, fifteen market headlines each carrying a rise/fall call, the ten hardest-pumping crypto pairs of the last five hours, market clocks, and today's weather.

## Why it exists

Retail traders juggle a broker app, two news sites, a crypto exchange tab and a weather widget. PulseDesk collapses that into a single always-visible surface that costs nothing to run — every data source is a free, keyless public API.

## Step flow

| # | Step | What happens | Where |
|---|------|--------------|-------|
| 1 | Launch | Electron boots, loads `settings.json` + `portfolio.json` from userData | `main.js` |
| 2 | Window | Frameless transparent window, always-on-top at `screen-saver` level, tray icon registered | `main.js` |
| 3 | Fast tick (60 s) | Indices, portfolio valuation, crypto pumps, Fear & Greed, sessions, breadth | `refreshFast()` |
| 4 | Medium tick (5 min) | RSS feeds → dedupe → sentiment → top 15; ticker mentions feed the hype scorer | `refreshMedium()` |
| 5 | Slow tick (30 min) | Geolocation + weather + air quality | `refreshSlow()` |
| 6 | Broadcast | Main pushes partial payloads over `data:update`; renderer patches only what changed | `preload.js` |
| 7 | Interact | Add/remove holdings, switch base currency, filter news, tune opacity/pinning | `src/renderer/app.js` |
| 8 | Persist | Bounds, settings, holdings and a daily net-worth snapshot written to userData | `portfolio.js` |

## Roles

| Role | Uses it for |
|------|-------------|
| Retail investor / trader | Portfolio P&L, hype radar, news direction calls |
| Crypto watcher | 5-hour pump table, Fear & Greed, BTC dominance |
| Desk operator | Market clocks, index tape, session countdowns |
| Owner (TandSol) | Maintenance, doc set, releases |

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Shell | Electron 33 | Frameless always-on-top window + tray, no browser chrome |
| Main process | Node 24 (`fetch`) | No HTTP dependency; CORS-free API access |
| Renderer | Vanilla HTML/CSS/JS | Zero build step, instant start, small memory footprint |
| Charts | Hand-rolled inline SVG | No chart library, no CSP exceptions |
| Storage | JSON files in `app.getPath('userData')` | Local-only, portable, user-inspectable |
| Packaging | electron-builder (nsis + portable) | Windows installer and no-install exe |
| Web + mobile | Same renderer + a fetch bridge, shipped as a PWA | One codebase, installable on Android/iOS/desktop, no app store |
| Data relay | Cloudflare Worker running the same service modules | Browsers can't call the upstreams directly (no CORS); edge cache keeps it free |
| Usage counter | Cloudflare D1, random client id | Counts devices and opens with no login and no PII |
| CI/CD | GitHub Actions → Pages + Releases | Free hosting and free Windows builds |

### Data sources (all free, no API key)

| Feed | Source | Used for |
|------|--------|----------|
| Quotes / charts | Yahoo Finance `v8/finance/chart` | Prices, day change, volume, sparklines |
| Quote fallback | Stooq CSV | US tickers when Yahoo throttles |
| Trending | Yahoo `v1/finance/trending/US` | Hype universe seed |
| News | Yahoo, MarketWatch, CNBC, Investing.com, ET Markets, Moneycontrol, Mint, Google News RSS | News wire |
| Crypto | Binance `ticker/24hr` + `ticker?windowSize=5h` | Exact 5-hour pump ranking |
| Crypto fallback | CoinGecko `coins/markets` | 1h/24h movers when Binance is unreachable |
| Sentiment index | alternative.me Fear & Greed | Crypto risk appetite |
| Weather | Open-Meteo forecast + air-quality | Temperature, rain, UV, AQI |
| Geolocation | ipapi.co → ipwho.is → New Delhi | Weather coordinates |

## How the numbers are derived

- **Hype score (0–100)** — `0.45 × volume-vs-20-day-average + 0.35 × |day move| + 0.20 × news mentions`, each min-max normalised across the candidate set. Universe = Yahoo trending ∪ curated US/India liquid names ∪ your holdings ∪ tickers named in today's headlines.
- **News direction** — a market-specific lexicon (`sentiment.js`) with negation handling, hedge damping and percentage-magnitude weighting. Output is `RISE` / `FALL` / `FLAT` plus a confidence percentage. It is a headline-tone classifier, not a price forecast.
- **Crypto pump** — Binance rolling-window ticker with `windowSize=5h`, restricted to USDT pairs above $3 M of 24 h quote volume, leveraged and stablecoin pairs excluded.
- **Portfolio** — per-holding `invested = qty × avg price`, `value = qty × live price`, both converted to your base currency at the live FX cross. Day P&L uses previous close. Realised P&L is booked when a holding is removed with a sell price.
- **Market pulse** — blends advance/decline ratio, average move, VIX band, news skew and Fear & Greed into a −100…+100 mood score.

## Run it

```bash
npm install
```

```bash
npm start
```

```bash
npm run build
```

`npm run dev` adds renderer console output to the terminal. `npm run build` produces an NSIS installer and a portable exe in `dist/`.

### Controls

| Action | How |
|--------|-----|
| Show / hide | `Ctrl+Alt+P`, tray click, or the ✕ button |
| Refresh now | `Ctrl+Alt+R` or the ⟳ button |
| Move / resize | Drag the title bar; drag any window edge |
| Always on top, opacity, click-through, all-desktops | Tray right-click menu, or the ⚙ settings panel |
| Compact mode | ▤ button — two columns, hides the allocation donut |
| Add a holding | **+ Add** → symbol (`RELIANCE.NS`, `AAPL`, `BTC-USD`), quantity, average price |
| Base currency | Dropdown in the portfolio header (INR/USD/EUR/GBP/AED) |

Data lives in `%APPDATA%\pulse-desk\` — `portfolio.json`, `history.json`, `settings.json`. Tray → *Open data folder* jumps there.

## Web and mobile

The phone version is the same dashboard. There is no app store and no fee — it installs straight from the browser:

- **Android (Chrome)** — open the link, tap the **Install app** button, done.
- **iPhone (Safari)** — open the link, **Share → Add to Home Screen**.
- **Desktop (Chrome/Edge)** — install icon in the address bar.

Build it yourself:

```bash
npm run web -- --api=https://pulsedesk-api.YOUR-SUBDOMAIN.workers.dev
```

Holdings entered on the web stay in that browser's local storage — they are never uploaded. The only thing the server ever sees is the list of ticker symbols it needs to price.

### Usage dashboard, without logins

Nobody signs in — not users, not the owner. Each browser makes a random id for itself; the edge worker counts those ids and app opens. **No email, no name, no IP address, no cookie.** The owner's private view (`/stats.html`, unlocked with a shared key) shows devices online now, opens today, distinct devices per day/week/all-time, a 30-day trend and a country/platform split.

Full zero-cost setup — Cloudflare, GitHub Pages, Releases and the stats key — is in **[DEPLOY.md](DEPLOY.md)**.

## Document index

| # | Document | File | Chain role |
|---|----------|------|-----------|
| 1 | Project Handbook | `README.md` | This file — entry point |
| 2 | Project Charter | `docs/PD_Project_Charter_v1.0.docx` | *why* |
| 3 | Project Management Plan | `docs/PD_Project_Management_Plan_v1.0.docx` | *how we run it* |
| 4 | Requirements Traceability Matrix | `docs/PD_RTM_v1.0.xlsx` | *what* |
| 5 | Software Design Document | `docs/PD_Design_Document_v1.0.docx` | *how* |
| 6 | Code Register | `docs/PD_Code_Register_v1.0.xlsx` | *where it lives* |
| 7 | Risk Register | `docs/PD_Risk_Register_v1.0.xlsx` | *what could go wrong* |
| 8 | Project Timeline | `docs/PD_Project_Timeline_v1.0.xlsx` | *when* |
| 9 | DPDP Compliance Tracker | `docs/PD_DPDP_Compliance_Tracker_v1.0.xlsx` | *lawfulness* |
| 10 | Data Retention Policy | `docs/PD_Data_Retention_Policy_v1.0.docx` | *how long* |
| + | Distribution runbook | `DEPLOY.md` | *how it reaches people, for ₹0* |

Chain: Charter → RTM → SDD → PMP → Risk Register. RTM rows carry a Design Ref into SDD sections; SDD sections list the Req IDs they satisfy; Code Register rows carry both. Regenerate the binary documents with `node tools/gen-docs.js`.

## Source material

Public API documentation for Yahoo Finance chart endpoints, Binance Spot REST (`/api/v3/ticker` rolling window), CoinGecko v3, Open-Meteo forecast and air-quality APIs, alternative.me Fear & Greed index, and the publishers' RSS feeds listed above.

## Status

Working build, verified against live data on 2026-08-01. All ten data services return, the window pins over other applications, and portfolio state survives restarts.

## Next steps

1. Deploy the worker and flip on Pages — see [DEPLOY.md](DEPLOY.md).
2. Broker import (Zerodha/Groww CSV) so holdings do not need manual entry.
3. Per-holding sell flow in the UI to book realised P&L (the store already supports it).
4. Price and P&L alerts via native notifications.
5. Optional NSE/BSE corporate-action and earnings-calendar strip.
6. Signed installer to remove the SmartScreen warning (recurring paid cost — deliberately deferred).

## Glossary

| Term | Meaning |
|------|---------|
| Hype score | Composite 0–100 attention metric (volume + move + news) |
| Direction call | Lexicon-derived RISE/FALL/FLAT tone of a headline |
| Pump | Percentage price gain over the trailing five-hour window |
| Breadth | Advancers versus decliners across the tracked universe |
| Pulse | −100…+100 aggregate market mood score |
| Unrealised P&L | Paper gain/loss on open positions |
| Realised P&L | Booked gain/loss from closed positions |
| Base currency | Currency all portfolio figures are converted into |
| userData | Per-user Electron storage directory (`%APPDATA%\pulse-desk`) |

---

*PulseDesk shows market data and headline tone for information only. Nothing in it is investment advice; the direction calls are text classification, not forecasts.*

*Created by Dheerav Tandon · Document ID PD-HB-001 · v1.0 · 2026-08-01 · MIT licensed*
