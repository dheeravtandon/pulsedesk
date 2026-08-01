'use strict';

/** Single source of truth for the PulseDesk document set. Update here, then re-run gen-docs.js. */

const META = {
  project: 'PulseDesk',
  prefix: 'PD',
  version: '1.0',
  date: '2026-08-01',
  author: 'TandSol',
  classification: 'Internal'
};

const RTM_FUNCTIONAL = [
  ['FUN-001', 'Hype Radar', 'Show the 5 most-hyped stocks with price, day change and sparkline', 'Investor', 'M', 'FUN', 'Charter §3.1', 'SDD §4.2', 'TC-F-001', '—', 'Verified'],
  ['FUN-002', 'Hype Radar', 'Rank hype as 0.45×volume-ratio + 0.35×|move| + 0.20×news mentions, min-max normalised', 'Investor', 'M', 'FUN', 'Charter §3.1', 'SDD §4.2', 'TC-F-002', '—', 'Verified'],
  ['FUN-003', 'Hype Radar', 'Build the candidate universe from Yahoo trending, curated IN/US liquid names, holdings and headline tickers', 'System', 'S', 'FUN', 'Charter §3.1', 'SDD §4.2', 'TC-F-003', '—', 'Verified'],
  ['FUN-004', 'Portfolio', 'Add, merge (weighted average), edit and remove holdings', 'Investor', 'M', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-004', '—', 'Verified'],
  ['FUN-005', 'Portfolio', 'Compute invested, current value, unrealised P&L and P&L% per holding and in total', 'Investor', 'M', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-005', '—', 'Verified'],
  ['FUN-006', 'Portfolio', 'Compute day P&L from previous close and show it against net worth', 'Investor', 'M', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-006', '—', 'Verified'],
  ['FUN-007', 'Portfolio', 'Book realised P&L into a trade log when a holding is closed with a sell price', 'Investor', 'S', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-007', '—', 'Developed'],
  ['FUN-008', 'Portfolio', 'Convert every holding to a user-selected base currency using the live FX cross', 'Investor', 'M', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-008', '—', 'Verified'],
  ['FUN-009', 'Portfolio', 'Show allocation weights as a donut with a legend of the top 8 positions', 'Investor', 'S', 'FUN', 'Charter §3.2', 'SDD §5.3', 'TC-F-009', '—', 'Verified'],
  ['FUN-010', 'Portfolio', 'Persist a daily net-worth snapshot and plot the trend', 'Investor', 'C', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-010', '—', 'Verified'],
  ['FUN-011', 'Portfolio', 'Track idle cash separately and include it in net worth', 'Investor', 'C', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-011', '—', 'Verified'],
  ['FUN-012', 'News Wire', 'Aggregate 8 RSS sources, de-duplicate by normalised headline and show the top 15', 'Investor', 'M', 'FUN', 'Charter §3.3', 'SDD §4.3', 'TC-F-012', '—', 'Verified'],
  ['FUN-013', 'News Wire', 'Classify each headline as RISE / FALL / FLAT with a confidence percentage', 'Investor', 'M', 'FUN', 'Charter §3.3', 'SDD §4.4', 'TC-F-013', '—', 'Verified'],
  ['FUN-014', 'News Wire', 'Extract mentioned tickers from headlines and feed the counts into the hype scorer', 'System', 'S', 'FUN', 'Charter §3.3', 'SDD §4.3', 'TC-F-014', '—', 'Verified'],
  ['FUN-015', 'News Wire', 'Filter the wire by direction (All / Rise / Fall)', 'Investor', 'S', 'FUN', 'Charter §3.3', 'SDD §5.3', 'TC-F-015', '—', 'Verified'],
  ['FUN-016', 'News Wire', 'Open a headline in the system browser, never inside the app window', 'Investor', 'M', 'FUN', 'Charter §3.3', 'SDD §6.3', 'TC-S-004', '—', 'Verified'],
  ['FUN-017', 'Crypto', 'Rank the 10 strongest USDT pairs over an exact trailing 5-hour window', 'Crypto watcher', 'M', 'FUN', 'Charter §3.4', 'SDD §4.6', 'TC-F-017', '—', 'Verified'],
  ['FUN-018', 'Crypto', 'Exclude leveraged tokens, stablecoin pairs and pairs under $3M of 24h quote volume', 'System', 'S', 'FUN', 'Charter §3.4', 'SDD §4.6', 'TC-F-018', '—', 'Verified'],
  ['FUN-019', 'Crypto', 'Show Fear & Greed, total market cap, BTC dominance and 24h cap change', 'Crypto watcher', 'S', 'FUN', 'Charter §3.4', 'SDD §4.6', 'TC-F-019', '—', 'Verified'],
  ['FUN-020', 'Markets', 'Scroll a live tape of Indian and US indices, commodities, USD/INR and BTC', 'Investor', 'M', 'FUN', 'Charter §3.5', 'SDD §4.1', 'TC-F-020', '—', 'Verified'],
  ['FUN-021', 'Markets', 'Show open/closed state and countdown for NSE, NYSE, LSE, TSE and crypto', 'Desk operator', 'S', 'FUN', 'Charter §3.5', 'SDD §4.7', 'TC-F-021', '—', 'Verified'],
  ['FUN-022', 'Markets', 'Derive advance/decline breadth and a −100…+100 pulse mood score', 'Investor', 'S', 'FUN', 'Charter §3.5', 'SDD §4.7', 'TC-F-022', '—', 'Verified'],
  ['FUN-023', 'Weather', 'Show current temperature, feels-like, humidity, wind, rain chance, UV, AQI and 8 hourly steps', 'Investor', 'M', 'FUN', 'Charter §3.6', 'SDD §4.8', 'TC-F-023', '—', 'Verified'],
  ['FUN-024', 'Weather', 'Resolve location by IP with a manual latitude/longitude override', 'Investor', 'S', 'FUN', 'Charter §3.6', 'SDD §4.8', 'TC-F-024', '—', 'Verified'],
  ['FUN-025', 'Shell', 'Keep the window above other applications and optionally on every virtual desktop', 'Investor', 'M', 'FUN', 'Charter §3.7', 'SDD §3.2', 'TC-F-025', '—', 'Verified'],
  ['FUN-026', 'Shell', 'Offer tray control for show/hide, pinning, opacity, click-through and data folder', 'Investor', 'M', 'FUN', 'Charter §3.7', 'SDD §3.3', 'TC-F-026', '—', 'Verified'],
  ['FUN-027', 'Shell', 'Register Ctrl+Alt+P (toggle) and Ctrl+Alt+R (refresh) global shortcuts', 'Investor', 'S', 'FUN', 'Charter §3.7', 'SDD §3.3', 'TC-F-027', '—', 'Verified'],
  ['FUN-028', 'Shell', 'Refresh on tiers — 60 s market, 5 min news/hype, 30 min weather', 'System', 'M', 'FUN', 'Charter §3.7', 'SDD §3.4', 'TC-F-028', '—', 'Verified'],
  ['FUN-029', 'Shell', 'Persist window bounds, pinning, opacity and compact mode between sessions', 'Investor', 'S', 'FUN', 'Charter §3.7', 'SDD §3.6', 'TC-F-029', '—', 'Verified'],
  ['FUN-030', 'Shell', 'Validate a symbol against the live quote service before a holding is saved', 'Investor', 'C', 'FUN', 'Charter §3.2', 'SDD §4.5', 'TC-F-030', '—', 'Verified'],
  ['FUN-031', 'Shell', 'Offer a two-column compact layout for narrow placements', 'Investor', 'C', 'FUN', 'Charter §3.7', 'SDD §5.2', 'TC-F-031', '—', 'Verified']
];

const RTM_SECURITY = [
  ['SEC-001', 'Shell', 'Renderer runs with contextIsolation on and nodeIntegration off', 'System', 'M', 'SEC', 'OWASP Electron', 'SDD §6.1', 'TC-S-001', 'CERT-In', 'Verified'],
  ['SEC-002', 'Shell', 'Renderer enforces a CSP of default-src self; script-src self', 'System', 'M', 'SEC', 'OWASP Electron', 'SDD §6.1', 'TC-S-002', 'CERT-In', 'Verified'],
  ['SEC-003', 'Renderer', 'Every remote string is HTML-escaped before insertion into the DOM', 'System', 'M', 'SEC', 'OWASP A03', 'SDD §6.2', 'TC-S-003', 'CERT-In', 'Verified'],
  ['SEC-004', 'Shell', 'window.open is denied; links open through shell.openExternal only', 'System', 'M', 'SEC', 'OWASP Electron', 'SDD §6.3', 'TC-S-004', 'CERT-In', 'Verified'],
  ['SEC-005', 'Shell', 'shell:open accepts http/https URLs only', 'System', 'M', 'SEC', 'OWASP A01', 'SDD §6.3', 'TC-S-005', 'CERT-In', 'Verified'],
  ['SEC-006', 'Services', 'No API keys, tokens or credentials exist in the repository or runtime', 'System', 'M', 'SEC', 'OWASP A07', 'SDD §6.4', 'TC-S-006', 'DPDP §8', 'Verified'],
  ['SEC-007', 'Storage', 'Portfolio and settings are stored locally; nothing is uploaded to any server', 'Investor', 'M', 'SEC', 'DPDP Act 2023', 'SDD §6.5', 'TC-S-007', 'DPDP §4, §8', 'Verified'],
  ['SEC-008', 'Services', 'Outbound calls are limited to the documented public endpoints; no user data is sent as a parameter', 'System', 'M', 'SEC', 'DPDP Act 2023', 'SDD §6.5', 'TC-S-008', 'DPDP §8', 'Verified'],
  ['SEC-009', 'Services', 'All network calls carry an abort timeout so a hostile or hung endpoint cannot stall the app', 'System', 'S', 'SEC', 'CERT-In', 'SDD §3.7', 'TC-S-009', 'CERT-In', 'Verified'],
  ['SEC-010', 'Renderer', 'Preview server binds to localhost and refuses paths outside the renderer directory', 'Developer', 'C', 'SEC', 'OWASP A01', 'SDD §7.2', 'TC-S-010', '—', 'Verified']
];

const RTM_NFR = [
  ['NFR-001', 'Shell', 'Cold start to first paint under 3 seconds on a mid-range Windows laptop', 'Investor', 'M', 'NFR', 'Charter §4', 'SDD §3.1', 'TC-N-001', '—', 'Verified'],
  ['NFR-002', 'Services', 'Market data no older than 60 seconds while the app is visible', 'Investor', 'M', 'NFR', 'Charter §4', 'SDD §3.4', 'TC-N-002', '—', 'Verified'],
  ['NFR-003', 'Services', 'A failing feed never blanks the dashboard — the last good value is served and the error is surfaced in the status bar', 'Investor', 'M', 'NFR', 'Charter §4', 'SDD §3.7', 'TC-N-003', '—', 'Verified'],
  ['NFR-004', 'Services', 'Outbound requests are pooled at a maximum of 8 concurrent calls to stay inside free rate limits', 'System', 'M', 'NFR', 'Charter §4', 'SDD §3.7', 'TC-N-004', '—', 'Verified'],
  ['NFR-005', 'Project', 'Zero paid services, subscriptions or API keys', 'Owner', 'M', 'NFR', 'Charter §2', 'SDD §2.2', 'TC-N-005', '—', 'Verified'],
  ['NFR-006', 'Renderer', 'Layout stays legible from 1240 px down to 620 px with no horizontal scrolling', 'Investor', 'S', 'NFR', 'Charter §4', 'SDD §5.2', 'TC-N-006', 'GIGW 3.0', 'Verified'],
  ['NFR-007', 'Renderer', 'Colour is never the only signal — direction is also carried by arrow glyphs and text', 'Investor', 'S', 'NFR', 'WCAG 2.1 AA', 'SDD §5.4', 'TC-N-007', 'GIGW 3.0', 'Verified'],
  ['NFR-008', 'Shell', 'Closing the window leaves the app resident in the tray rather than quitting', 'Investor', 'S', 'NFR', 'Charter §4', 'SDD §3.3', 'TC-N-008', '—', 'Verified'],
  ['NFR-009', 'Project', 'No build step for the renderer — plain HTML/CSS/JS so the app stays auditable', 'Owner', 'C', 'NFR', 'Charter §4', 'SDD §2.2', 'TC-N-009', '—', 'Verified'],
  ['NFR-010', 'Services', 'Every primary data source has a documented fallback path', 'System', 'S', 'NFR', 'Charter §4', 'SDD §2.3', 'TC-N-010', '—', 'Verified']
];

const CODE_REGISTER = [
  ['package.json', 'Config', 'Manifest, scripts and electron-builder packaging targets', '—', '—', 'NFR-005, NFR-009', 'SDD §2.2', 'Done'],
  ['main.js', 'Main process', 'Window lifecycle, tray, global shortcuts, IPC surface, tiered refresh orchestration', 'IPC: data:*, portfolio:*, settings:*, win:*', 'settings.json', 'FUN-025..FUN-029, SEC-004, SEC-005', 'SDD §3', 'Done'],
  ['preload.js', 'Bridge', 'contextBridge API exposed to the renderer as window.pulse', 'IPC allowlist', '—', 'SEC-001', 'SDD §6.1', 'Done'],
  ['src/services/http.js', 'Service', 'fetch wrapper with abort timeout, TTL cache with stale fallback, bounded-concurrency pool', '—', '—', 'NFR-003, NFR-004, SEC-009', 'SDD §3.7', 'Done'],
  ['src/services/stocks.js', 'Service', 'Yahoo chart normalisation, Stooq fallback, index basket, FX cross, hype scoring', '—', '—', 'FUN-001..FUN-003, FUN-008, FUN-020, NFR-010', 'SDD §4.1, §4.2', 'Done'],
  ['src/services/sentiment.js', 'Service', 'Market-headline lexicon with negation, hedging and percentage weighting', '—', '—', 'FUN-013', 'SDD §4.4', 'Done'],
  ['src/services/news.js', 'Service', 'RSS/Atom fetch and parse, entity repair, de-duplication, ticker extraction, ranking', '—', '—', 'FUN-012, FUN-014, SEC-003', 'SDD §4.3', 'Done'],
  ['src/services/crypto.js', 'Service', 'Binance 5-hour rolling-window ranking, CoinGecko fallback, Fear & Greed, global stats', '—', '—', 'FUN-017..FUN-019, NFR-010', 'SDD §4.6', 'Done'],
  ['src/services/weather.js', 'Service', 'IP geolocation chain, Open-Meteo forecast, air quality, weather-code mapping', '—', '—', 'FUN-023, FUN-024', 'SDD §4.8', 'Done'],
  ['src/services/portfolio.js', 'Service', 'JSON store, weighted-average merge, valuation, realised/unrealised P&L, daily snapshots', '—', 'portfolio.json, history.json', 'FUN-004..FUN-011, SEC-007', 'SDD §4.5', 'Done'],
  ['src/services/market.js', 'Service', 'Exchange session clocks, breadth calculation, composite pulse score', '—', '—', 'FUN-021, FUN-022', 'SDD §4.7', 'Done'],
  ['src/services/icon.js', 'Service', 'Dependency-free RGBA PNG encoder used for the tray and window icon', '—', '—', 'FUN-026', 'SDD §3.3', 'Done'],
  ['src/renderer/index.html', 'Renderer', 'Dashboard markup, CSP declaration, modal shells', '—', '—', 'SEC-002, NFR-006', 'SDD §5.1', 'Done'],
  ['src/renderer/styles.css', 'Renderer', 'Glass finance theme, fixed-height card grid, responsive and compact layouts', '—', '—', 'FUN-031, NFR-006, NFR-007', 'SDD §5.2', 'Done'],
  ['src/renderer/app.js', 'Renderer', 'Formatting helpers, SVG sparkline/donut builders, section renderers, event wiring', '—', '—', 'FUN-009, FUN-015, FUN-030, SEC-003', 'SDD §5.3', 'Done'],
  ['tools/preview-server.js', 'Tooling', 'Localhost static server for renderer iteration outside Electron', 'http://localhost:5173', '—', 'SEC-010', 'SDD §7.2', 'Done'],
  ['tools/docs/content.js', 'Tooling', 'Content tables backing the generated document set', '—', '—', '—', 'SDD §7.3', 'Done'],
  ['tools/gen-docs.js', 'Tooling', 'Generates the docx and xlsx documents from content.js', '—', '—', '—', 'SDD §7.3', 'Done'],
  ['.claude/launch.json', 'Config', 'Preview server launch configuration', '—', '—', '—', 'SDD §7.2', 'Done'],
  ['README.md', 'Docs', 'Project handbook and document index', '—', '—', '—', 'SDD §1', 'Done']
];

const RISKS = [
  ['RSK-001', 'Technical', 'Yahoo Finance chart endpoint starts requiring a crumb/cookie or blocks the client', 'Undocumented API hardening', 'Quotes, indices and hype radar go blank', 4, 5, 'Mitigate', 'Stooq CSV fallback is wired for US tickers; TTL cache serves the last good value; add a second provider (Twelve Data free tier) if failures persist', 'Owner', 'Open', '2026-09-15'],
  ['RSK-002', 'Technical', 'Binance API is geo-blocked or rate-limits the rolling-window endpoint', 'Regional restrictions or weight overrun', 'Crypto pump table degrades to a 1-hour CoinGecko proxy', 3, 3, 'Mitigate', 'CoinGecko fallback already implemented and labelled in the UI; request chunking keeps weight under the per-minute cap', 'Owner', 'Open', '2026-09-15'],
  ['RSK-003', 'Technical', 'An RSS publisher changes feed URL or format', 'Publisher CMS migration', 'One of eight sources drops out of the wire', 4, 2, 'Accept', 'Per-feed failures are isolated by the pool; the wire still renders from the remaining sources', 'Owner', 'Open', '2026-10-01'],
  ['RSK-004', 'Product', 'Users read the RISE/FALL badge as a price prediction', 'Label ambiguity', 'Misinformed trades, reputational harm', 3, 5, 'Mitigate', 'Handbook and in-app footer state it is headline tone, not a forecast; confidence bar shown alongside; no buy/sell language used', 'Owner', 'Open', '2026-09-01'],
  ['RSK-005', 'Technical', 'Sentiment lexicon misclassifies sarcasm, negation chains or non-English headlines', 'Rule-based classifier limits', 'Wrong direction call on individual items', 4, 3, 'Mitigate', 'Negation window and hedge damping implemented; confidence surfaces uncertainty; review lexicon quarterly against sampled headlines', 'Owner', 'Open', '2026-11-01'],
  ['RSK-006', 'Data', 'Corporate actions (splits, bonuses) distort average buy price and P&L', 'No corporate-action feed', 'Overstated or understated returns on affected holdings', 3, 4, 'Mitigate', 'Holdings are user-editable so the average price can be corrected; a corporate-action strip is on the roadmap', 'Owner', 'Open', '2026-12-01'],
  ['RSK-007', 'Data', 'FX cross unavailable, leaving foreign holdings valued at a 1:1 rate', 'Yahoo FX symbol failure', 'Materially wrong net worth', 2, 5, 'Mitigate', 'fxRate falls back to 1 and the failure is listed in the status bar; cache the last known cross across restarts (planned)', 'Owner', 'Open', '2026-09-30'],
  ['RSK-008', 'Security', 'Malicious content in a headline attempts script injection into the renderer', 'Untrusted third-party text', 'Renderer compromise', 2, 5, 'Mitigate', 'All remote text is HTML-escaped, CSP blocks inline and remote scripts, node integration is off', 'Owner', 'Closed', '2026-08-01'],
  ['RSK-009', 'Privacy', 'IP geolocation lookup discloses approximate user location to a third party', 'Weather needs coordinates', 'Privacy expectation mismatch', 3, 2, 'Mitigate', 'Manual latitude/longitude override in settings bypasses the lookup entirely; documented in the retention policy', 'Owner', 'Open', '2026-09-15'],
  ['RSK-010', 'Operational', 'Always-on-top window obscures other applications during screen sharing', 'Pinning is the default', 'User annoyance, accidental data exposure on shared screens', 4, 2, 'Mitigate', 'Ctrl+Alt+P hides instantly, tray toggles pinning, opacity and click-through modes available', 'Owner', 'Closed', '2026-08-01'],
  ['RSK-011', 'Technical', 'Electron major-version upgrade breaks transparency or always-on-top behaviour on Windows', 'Upstream Chromium changes', 'Widget stops behaving like a widget', 2, 3, 'Mitigate', 'Version pinned in package.json; smoke-test pinning and transparency before any upgrade', 'Owner', 'Open', '2027-01-15'],
  ['RSK-012', 'Operational', 'Single maintainer — no cover for defect response', 'Solo project', 'Slow fixes if the maintainer is unavailable', 3, 3, 'Accept', 'Codebase kept dependency-light and documented so a second developer can pick it up from the Code Register', 'Owner', 'Open', '2026-12-01']
];

const TIMELINE = [
  ['Phase 1', 'Discovery', 'Scope the seven requested panels, choose free keyless data sources, verify each endpoint responds', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Sequential'],
  ['Phase 2', 'Architecture', 'Main/renderer split, IPC surface, tiered refresh design, storage layout', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Sequential'],
  ['Phase 3', 'Data services', 'stocks, news, sentiment, crypto, weather, portfolio, market, http, icon', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Parallel'],
  ['Phase 4', 'Shell', 'Frameless pinned window, tray menu, global shortcuts, settings persistence', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Parallel'],
  ['Phase 5', 'Interface', 'Vibrant glass theme, card grid, SVG sparklines and donut, modals, compact mode', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Sequential'],
  ['Phase 6', 'Verification', 'Live smoke test of all services, layout audit at three widths, security review', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Sequential'],
  ['Phase 7', 'Documentation', 'Handbook plus the nine controlled documents', '2026-08-01', '2026-08-01', '1 day', 'Owner', 'Sequential'],
  ['Phase 8', 'Roadmap', 'Broker CSV import, sell flow, alerts, corporate actions, signed installer', '2026-08-04', '2026-10-31', '13 weeks', 'Owner', 'Sequential']
];

const DPDP = [
  ['DP-01', '§2(t) Personal data', 'Identify whether the app processes personal data', 'Applicable', 'Done', 'Only portfolio holdings, base currency, cash and approximate location are held, all on the user device (portfolio.json, settings.json)', 'Owner', '2027-02-01', 'No account, no identifier, no server-side profile'],
  ['DP-02', '§4 Grounds for processing', 'Process only for a lawful purpose with consent or legitimate use', 'Applicable', 'Done', 'Data is entered by the user for their own display; nothing is processed for any other purpose', 'Owner', '2027-02-01', 'Voluntary, purpose-limited, on-device'],
  ['DP-03', '§5 Notice', 'Give notice of what is collected and why', 'Applicable', 'Done', 'README.md "How the numbers are derived" and PD_Data_Retention_Policy_v1.0.docx describe every stored field and every outbound call', 'Owner', '2027-02-01', 'In-app settings panel exposes the location override'],
  ['DP-04', '§6 Consent', 'Obtain free, specific, informed consent where consent is the ground', 'Partially applicable', 'Done', 'Holdings only exist because the user typed them; geolocation can be replaced with manual coordinates in settings', 'Owner', '2027-02-01', 'No dark patterns, no pre-ticked options'],
  ['DP-05', '§7 Legitimate uses', 'Rely on legitimate use only where permitted', 'Not applicable', 'Not Started', 'No processing occurs outside the user own device for their own benefit', 'Owner', '2027-02-01', '—'],
  ['DP-06', '§8(4) Security safeguards', 'Apply reasonable security safeguards to prevent breach', 'Applicable', 'Done', 'contextIsolation on, nodeIntegration off, CSP enforced, all remote text escaped, external links sandboxed to the system browser', 'Owner', '2027-02-01', 'Verified in the security review of 2026-08-01'],
  ['DP-07', '§8(5) Breach notification', 'Notify the Board and affected users of a personal data breach', 'Partially applicable', 'Partial', 'No central store exists to breach; a compromised release would be handled by a repository advisory', 'Owner', '2027-02-01', 'Formal advisory template still to be written'],
  ['DP-08', '§8(7) Erasure', 'Erase personal data when the purpose is served or consent is withdrawn', 'Applicable', 'Done', 'Deleting %APPDATA%\\pulse-desk removes every stored field; the tray menu opens that folder directly', 'Owner', '2027-02-01', 'Documented in PD-DRP-001 §4'],
  ['DP-09', '§8(9) Grievance redressal', 'Publish a contact point for data grievances', 'Applicable', 'Partial', 'Owner contact is the repository maintainer listed in README.md', 'Owner', '2027-02-01', 'Add a dedicated grievance email before public distribution'],
  ['DP-10', '§9 Children data', 'Do not process children data without verifiable parental consent', 'Not applicable', 'Not Started', 'No age data collected; the app is a personal finance tool for adults', 'Owner', '2027-02-01', '—'],
  ['DP-11', '§11 Right to access and correction', 'Let the user access and correct their data', 'Applicable', 'Done', 'Holdings are editable in the UI and the underlying JSON files are plain text the user can open', 'Owner', '2027-02-01', 'Tray → Open data folder'],
  ['DP-12', '§16 Cross-border transfer', 'Respect restrictions on transfer outside India', 'Applicable', 'Done', 'No personal data is transmitted; outbound calls carry only ticker symbols and, unless overridden, an IP-derived coordinate pair', 'Owner', '2027-02-01', 'Manual coordinates remove even that'],
  ['CI-01', 'CERT-In 2022 §(ii) Log retention', 'Retain system logs for 180 days within India', 'Partially applicable', 'Partial', 'App keeps no server logs; only a 400-entry local net-worth history exists', 'Owner', '2027-02-01', 'Applies only if a hosted component is ever added'],
  ['CI-02', 'CERT-In 2022 §(i) Incident reporting', 'Report reportable incidents within 6 hours', 'Partially applicable', 'Not Started', 'No hosted surface to attack today', 'Owner', '2027-02-01', 'Revisit if a sync backend is introduced'],
  ['GW-01', 'GIGW 3.0 / WCAG 2.1 AA', 'Meet contrast and non-colour-only signalling', 'Applicable', 'Partial', 'Direction is carried by arrows and text as well as colour; a full contrast audit is outstanding', 'Owner', '2026-11-01', 'NFR-007']
];

const RETENTION = [
  ['Portfolio holdings', 'Symbol, quantity, average buy price, buy date', 'Held until the user deletes the holding or the data folder', 'User instruction — data exists solely to render their own dashboard', 'portfolio.json'],
  ['Closed trades', 'Symbol, quantity, buy price, sell price, date', 'Held until the user clears portfolio.json', 'Needed to show realised P&L', 'portfolio.json'],
  ['Net-worth history', 'Date, portfolio value, unrealised P&L', 'Rolling 400 entries, oldest dropped automatically', 'Needed to draw the value trend', 'history.json'],
  ['Application settings', 'Window bounds, pinning, opacity, compact mode, hype universe, manual coordinates, cash balance', 'Held until reset or folder deletion', 'Needed to restore the user layout', 'settings.json'],
  ['In-memory API cache', 'Recent third-party responses', 'Discarded when the process exits; TTL 2–360 minutes', 'Rate-limit protection', 'process memory'],
  ['Chromium cache', 'Standard Electron/Chromium cache directories', 'Managed by Chromium; cleared with the data folder', 'Runtime requirement', '%APPDATA%\\pulse-desk']
];

module.exports = { META, RTM_FUNCTIONAL, RTM_SECURITY, RTM_NFR, CODE_REGISTER, RISKS, TIMELINE, DPDP, RETENTION };
