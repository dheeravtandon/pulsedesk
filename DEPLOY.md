# Shipping PulseDesk to the world for ₹0

**Document ID:** PD-DEP-001 · **Version:** 1.0 · **Date:** 2026-08-01 · **Prepared by:** Dheerav Tandon
**Status:** Living · **Related:** PD-HB-001 (README), PD-SDD-001 §7, PD-DPDP-001

Everything below costs nothing, permanently. No credit card is required at any step.

---

## What you end up with

| Thing | Link people get | Cost |
|-------|-----------------|------|
| Web + mobile app (installable) | `https://dheeravtandon.github.io/pulsedesk/` | ₹0 |
| Windows desktop app | GitHub Releases download | ₹0 |
| Market data relay (the bit that makes mobile possible) | `https://pulsedesk-api.<your-subdomain>.workers.dev` | ₹0 |
| Your private usage dashboard | `https://dheeravtandon.github.io/pulsedesk/stats.html` | ₹0 |

### Why the free limits are not a problem

| Service | Free allowance | What PulseDesk actually uses |
|---------|----------------|------------------------------|
| GitHub Pages | 100 GB bandwidth/month, 1 GB site | The app is ~120 KB. Roughly 800,000 loads/month. |
| GitHub Releases | Unlimited public downloads | The installer is ~80 MB, downloaded once per user. |
| Cloudflare Workers | 100,000 requests/day | Market responses are edge-cached for 60 s–30 min, so 10,000 users still cost roughly 2,000 upstream calls/day. |
| Cloudflare D1 | 5 GB storage, 5 M row reads/day | One row per app open. A million opens is a few hundred MB. |
| Market data (Yahoo, Binance, CoinGecko, Open-Meteo, RSS) | Public, keyless | One shared call per cache window, not one per user. |

---

## Step 1 — Put the code on GitHub

```bash
gh repo create pulsedesk --public --source=. --remote=origin --push
```

No `gh` CLI? Create an empty public repo named `pulsedesk` on github.com, then:

```bash
git remote add origin https://github.com/dheeravtandon/pulsedesk.git && git branch -M main && git push -u origin main
```

---

## Step 2 — Put the data relay on Cloudflare

A phone browser cannot call Yahoo Finance or Binance directly — those servers do not send CORS headers, so the browser refuses the response. The Worker is the fix: it runs the same data code the desktop app runs and answers with CORS enabled. It is also what counts your users.

**2.1 — Sign up** at `dash.cloudflare.com/sign-up`. Free plan. No card.

**2.2 — Create the database** (from the `worker/` folder):

```bash
cd worker && npx wrangler login && npx wrangler d1 create pulsedesk
```

Copy the `database_id` it prints into `worker/wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_ID`.

**2.3 — Create the tables:**

```bash
npx wrangler d1 execute pulsedesk --remote --file=./schema.sql
```

**2.4 — Set the password for your private stats page:**

```bash
npx wrangler secret put STATS_KEY
```

Type any long random string when prompted. This is what you will paste into the dashboard — it is not an account, just a shared secret.

**2.5 — Deploy:**

```bash
npx wrangler deploy
```

It prints your Worker URL. Check it is alive:

```bash
curl "https://pulsedesk-api.<your-subdomain>.workers.dev/api/health"
```

Every entry should read `"ok": true`. If `yahoo` reports false, see *Troubleshooting* below.

---

## Step 3 — Publish the web and mobile app

**3.1** — In the repo: **Settings → Secrets and variables → Actions → Variables → New variable**
Name `PULSE_API`, value your Worker URL (no trailing slash).

**3.2** — **Settings → Pages → Build and deployment → Source: GitHub Actions.**

**3.3** — Push anything, or run the *Deploy web app to GitHub Pages* workflow by hand. Two minutes later the app is live at:

```
https://dheeravtandon.github.io/pulsedesk/
```

### How people "download" it on a phone

There is no store and no fee — the app installs straight from the browser:

- **Android (Chrome):** open the link → an **Install app** button appears at the bottom right → tap it. It lands on the home screen with its own icon and opens without browser chrome.
- **iPhone (Safari):** open the link → **Share** → **Add to Home Screen**. The app shows this hint automatically on first visit.
- **Desktop (Chrome/Edge):** the install icon appears in the address bar.

Once installed it works like any app, keeps working offline for the shell, and updates itself silently whenever you push.

---

## Step 4 — Publish the Windows app

```bash
git tag v1.0.0 && git push origin v1.0.0
```

GitHub Actions builds it on a Windows runner and attaches two files to the release:

- `PulseDesk Setup 1.0.0.exe` — normal installer
- `PulseDesk-1.0.0-portable.exe` — no install, just run it

Download page: `https://github.com/dheeravtandon/pulsedesk/releases/latest`

> **SmartScreen:** the build is unsigned, so Windows shows *"Windows protected your PC"* on first run. Users click **More info → Run anyway**. A code-signing certificate removes this but costs roughly ₹15,000–35,000 a year — the free alternative is to say so plainly on the release page, which the generated release notes do.

---

## Step 5 — Your usage dashboard

Open `https://dheeravtandon.github.io/pulsedesk/stats.html`, paste the `STATS_KEY` from step 2.4. It is remembered on your device only.

You see:

- **Online right now** — distinct devices active in the last five minutes
- **Opens today** — app launches since midnight UTC (your "logins in a day")
- **People today / this week / all time** — distinct devices
- **30-day bar chart**, plus a country and platform breakdown

Nobody logs in — not your users, not you. Each browser generates a random id for itself and stores it locally; the Worker counts those ids. **No email, no name, no IP address and no cookie is ever stored.** A user who clears site data becomes a new anonymous id, which is the honest trade-off for a login-free product.

---

## Step 6 — The Instagram story

Stories need a link people can tap. Use:

```
https://dheeravtandon.github.io/pulsedesk/
```

Suggested caption:

> **PulseDesk** — free live markets dashboard. Hyped stocks, your portfolio P&L, news that calls the direction, 5-hour crypto pumps. No login, nothing stored on a server. Tap → *Add to Home Screen*. 📈

Two practical notes: put the same link in your Instagram bio, because story link stickers expire after 24 hours; and add a screenshot of the dashboard as the story background so people can see what they are installing.

---

## Troubleshooting

**`/api/health` says yahoo is false.** Some upstreams throttle datacentre IP ranges. The Worker already falls back to Stooq for US tickers. If Indian symbols also fail, add a second provider inside `chart()` in `src/services/stocks.js` — the fallback chain is designed for it.

**The web app loads but stays empty.** `config.js` has no API URL. Check the `PULSE_API` repository variable and re-run the Pages workflow.

**Nothing appears on the stats page.** Confirm the D1 `database_id` in `wrangler.toml` is real, that `schema.sql` ran with `--remote`, and that `STATS_KEY` matches what you paste.

**"Failed to fetch" on the phone but fine on desktop.** The Worker URL must be `https`. A mixed-content page will not load it.

---

## What is deliberately not free

| Option | Cost | Verdict |
|--------|------|---------|
| Google Play listing | $25 once | Only worth it if you want store search traffic; the PWA installs the same app for free. |
| Apple App Store | $99/year | Not worth it. iOS installs the PWA from Safari at no cost. |
| Windows code signing | ~₹15,000+/year | Removes the SmartScreen warning. Skip it and explain the warning instead. |
| Custom domain | ~₹800/year | Optional. GitHub Pages and Cloudflare both accept one free of charge; only the domain itself costs money. |

---

*Created by Dheerav Tandon · PD-DEP-001 · v1.0 · 2026-08-01*
