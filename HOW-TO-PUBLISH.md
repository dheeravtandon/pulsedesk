# Publishing PulseDesk — the no-typing version

**For:** Dheerav Tandon · **Version:** 1.0 · **Date:** 2026-08-01
**You need:** a web browser and about 40 minutes. **You do not need:** the black terminal window.

Every step below is clicking buttons on a website. Where a box of text appears, you copy it and paste it — you never have to type commands.

---

## Part A — Run it on your own PC first

1. Open the `D:\stock` folder.
2. Double-click **`run-pulsedesk.bat`**.
3. A black window opens and the app appears. Leave the black window alone — closing it closes the app.

If it says Node.js is missing: go to **nodejs.org**, click the big green **LTS** button, install it (just keep clicking Next), then double-click `run-pulsedesk.bat` again.

> The first run takes 2–5 minutes because it downloads what it needs. Every run after that is instant.

---

## Part B — Put the code on GitHub (no commands)

**B1.** Make a free account at **github.com** if you don't have one. Your username should be `dheeravtandon` — the links below assume it.

**B2.** Download **GitHub Desktop** from **desktop.github.com**. Install it and sign in with your GitHub account.

**B3.** In GitHub Desktop: **File → Add local repository** → click **Choose…** → pick `D:\stock` → **Add repository**.

**B4.** Look at the top of the window. Click **Publish repository**.

- Name: `pulsedesk`
- **Untick** "Keep this code private" ← important, free hosting only works on public repos
- Click **Publish repository**

Your code is now at `https://github.com/dheeravtandon/pulsedesk`.

> From now on, whenever you change something: open GitHub Desktop, type a short note in the bottom-left box, click **Commit to main**, then click **Push origin** at the top. That's the whole workflow.

---

## Part C — Turn on the free website

**C1.** Go to `https://github.com/dheeravtandon/pulsedesk`

**C2.** Click **Settings** (top right of the repo, gear icon).

**C3.** In the left sidebar click **Pages**.

**C4.** Under *Build and deployment* → *Source*, choose **GitHub Actions** from the dropdown. Nothing else to fill in.

Leave this tab open — you come back in Part E.

---

## Part D — Turn on the data relay (Cloudflare)

Phones can't fetch stock prices directly — the price websites block them. This little relay does it for them. It is free and needs no card.

**D1.** Sign up at **dash.cloudflare.com/sign-up**. Free plan. Verify your email.

**D2. Create the worker.**
- Left sidebar → **Workers & Pages** → **Create** → **Create Worker**
- Name it `pulsedesk-api` → **Deploy**
- Click **Edit code** (or **Continue to project → Edit code**)

**D3. Paste the code.**
- On your PC open `D:\stock\worker\dist\worker.js` in Notepad
  *(if that file is missing, double-click `make-worker-file.bat` in the `D:\stock` folder first)*
- Select all (**Ctrl+A**) and copy (**Ctrl+C**)
- Back in the Cloudflare editor: click inside the code, select all (**Ctrl+A**), paste (**Ctrl+V**)
- Click **Deploy** (top right)

**D4. Create the database** (this is what counts your users).
- Left sidebar → **Storage & Databases** → **D1 SQL Database** → **Create**
- Name it exactly `pulsedesk` → **Create**

**D5. Add the tables.**
- Open your new `pulsedesk` database → **Console** tab
- Open `D:\stock\worker\schema.sql` in Notepad, copy everything, paste it into the console box
- Click **Execute**

**D6. Connect the database to the worker.**
- Left sidebar → **Workers & Pages** → click `pulsedesk-api`
- **Settings** → **Bindings** → **Add** → **D1 database**
- Variable name: `DB` (capital letters, exactly)
- D1 database: `pulsedesk`
- **Deploy**

**D7. Set your dashboard password.**
- Same **Settings** page → **Variables and Secrets** → **Add**
- Type: **Secret**
- Name: `STATS_KEY`
- Value: make up a long password, e.g. `pulse-dheerav-9x42-quiet-lion`. **Write it down.**
- **Deploy**

**D8. Check it works.**
At the top of the worker page you'll see its address, something like
`https://pulsedesk-api.dheeravtandon.workers.dev`

Open that address with `/api/health` on the end in a new tab. You should see text with `"ok":true` several times. **Copy the address** (without `/api/health`) — you need it next.

---

## Part E — Connect the website to the relay

**E1.** Back on GitHub: `https://github.com/dheeravtandon/pulsedesk` → **Settings**

**E2.** Left sidebar → **Secrets and variables** → **Actions**

**E3.** Click the **Variables** tab → **New repository variable**

- Name: `PULSE_API`
- Value: your worker address from D8, e.g. `https://pulsedesk-api.dheeravtandon.workers.dev`
- **Add variable**

**E4.** Click the **Actions** tab at the top of the repo → in the left list click **Deploy web app to GitHub Pages** → **Run workflow** → **Run workflow**.

Wait for the green tick (about 2 minutes). Your app is now live at:

```
https://dheeravtandon.github.io/pulsedesk/
```

Open it on your phone right now to check.

---

## Part F — Make the Windows download

**F1.** Go to your repo → click **Releases** (right sidebar) → **Create a new release**.

**F2.** Click **Choose a tag**, type `v1.0.0`, then click **+ Create new tag: v1.0.0 on publish**.

**F3.** Title: `PulseDesk 1.0`. Description: anything, e.g. *First release. Free, no login.*

**F4.** Click **Publish release**.

**F5.** Go to the **Actions** tab and watch *Build Windows app and publish release* run. It takes 5–10 minutes. When it's green, go back to **Releases** — two `.exe` files are now attached.

Your download page is:

```
https://github.com/dheeravtandon/pulsedesk/releases/latest
```

> **Warning users will see:** Windows shows *"Windows protected your PC"* the first time. They click **More info** → **Run anyway**. This happens to every app that hasn't paid for a signing certificate (about ₹15,000 a year). Mention it in your post so people aren't spooked.

---

## Part G — Your private usage dashboard

Open:

```
https://dheeravtandon.github.io/pulsedesk/stats.html
```

Paste the `STATS_KEY` you invented in D7. You'll see:

- **Online right now** — how many devices have it open
- **Opens today** — how many times it was opened since midnight
- **People today / this week / all time**
- A 30-day bar chart, plus which countries and which devices

Nobody logs in — not your users, not you. Each phone or laptop makes up a random number for itself and that's all that's counted. No emails, no names, no IP addresses.

---

## Part H — Share it

Copy-paste ready. **Story sticker link** and **bio link**:

```
https://dheeravtandon.github.io/pulsedesk/
```

**Instagram story caption:**

```
Built PulseDesk 📈 — a free live markets dashboard.
Hyped stocks · your portfolio P&L · news that calls rise or fall · crypto pumps
No login. Nothing saved on any server.
Tap the link → Add to Home Screen. That's the install.
```

**WhatsApp / Instagram DM:**

```
Made a free markets app — PulseDesk.
Phone: https://dheeravtandon.github.io/pulsedesk/  (open it, then Add to Home Screen)
Windows: https://github.com/dheeravtandon/pulsedesk/releases/latest
No sign-up, no ads, nothing stored online.
```

**Instagram bio:**

```
📈 PulseDesk — free live markets dashboard ↓
```

Two practical things: story link stickers vanish after 24 hours, so put the link in your **bio** as well; and use a screenshot of the dashboard as the story background so people can see what they're installing.

---

## If something breaks

| What you see | What to do |
|---|---|
| Website loads but every panel says "Failed to fetch" | The `PULSE_API` variable is wrong or missing. Redo Part E, then re-run the Pages workflow. |
| `/api/health` shows `"ok":false` for yahoo | The price site is throttling Cloudflare. The app still works from other sources; tell me and I'll add another backup source. |
| Stats page says "wrong key" | The key you typed doesn't match the secret in D7. Redo D7 with a fresh key. |
| Stats page shows all zeros | The database isn't connected. Redo D5 and D6 — the binding name must be exactly `DB`. |
| Actions tab shows a red X | Click into it, screenshot the red step, and send it to me. |

---

*Created by Dheerav Tandon · PD-PUB-001 · v1.0 · 2026-08-01*
