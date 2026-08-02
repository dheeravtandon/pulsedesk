# Installing PulseDesk

Free. No account. Nothing you type in ever leaves your device.

---

## 📱 On your phone (Android or iPhone)

There is no app store download — it installs straight from the browser and behaves exactly like a normal app afterwards.

**Android (Chrome)**

1. Open **https://dheeravtandon.github.io/pulsedesk/**
2. An **⬇ Install app** button appears at the bottom right — tap it.
3. Tap **Install** on the popup.
4. PulseDesk is now on your home screen with its own icon.

*No button showing?* Tap the **⋮** menu (top right) → **Add to Home screen** → **Install**.

**iPhone / iPad (Safari)**

1. Open **https://dheeravtandon.github.io/pulsedesk/** in **Safari** (not Chrome — iPhone only allows this from Safari).
2. Tap the **Share** button — the square with an arrow pointing up, at the bottom of the screen.
3. Scroll down the list and tap **Add to Home Screen**.
4. Tap **Add** (top right).

Open it from the home-screen icon and it fills the whole screen — no address bar, no browser.

---

## 💻 On a Windows PC

**Option 1 — the installer (recommended)**

1. Go to **https://github.com/dheeravtandon/pulsedesk/releases/latest**
2. Under **Assets**, download the file called **`PulseDesk Setup 1.0.0.exe`**
3. Double-click it.
4. Windows may say **"Windows protected your PC"** → click **More info** → **Run anyway**.
   *This appears because the app isn't signed with a paid certificate. It is safe — the entire source code is public on the same page.*
5. Follow the installer. PulseDesk appears in your Start menu and on the desktop.

**Option 2 — no installing at all**

Download **`PulseDesk-1.0.0-portable.exe`** from the same page and just double-click it. Nothing is installed; delete the file to remove it.

**Option 3 — in your browser**

Open **https://dheeravtandon.github.io/pulsedesk/** in Chrome or Edge and click the **install icon** in the address bar (a small screen with a down arrow). You get a proper desktop window.

**Option 4 — running from the source folder**

Double-click **`PulseDesk.vbs`**. The app opens on its own with **no black console window** behind it.

The first time only, it asks permission to download what it runs on (2–5 minutes). After that it starts straight away.

*There is deliberately no `.bat` launcher: double-clicking one always opens a console window that stays on screen for as long as the app runs. If you want to watch the logs, run `npm start` from a terminal yourself.*

**Quitting properly**

Clicking **✕** only hides the window to the tray — the app keeps running. To actually quit, right-click the tray icon and choose **Quit**.

---

## 🖥️ Using the desktop app

| What you want | How |
|---|---|
| Keep it floating above everything | It already does. Turn it off in the tray menu → *Always on top* |
| Hide or show it instantly | **Ctrl + Alt + P** |
| Refresh right now | **Ctrl + Alt + R** |
| Full screen | The **⛶** button, or **F11** |
| Move it | Drag the top bar |
| Make it see-through | Right-click the tray icon → *Opacity* |
| Let clicks pass through it | Right-click the tray icon → *Click-through (widget mode)* |
| Close to the tray | The **✕** button hides it; quit properly from the tray menu |

---

## 💼 Adding your holdings

1. Click **+ Add holding**.
2. Start typing a company name — `reliance`, `tata`, `apple`, `bitcoin`. A list appears; click the right one. NSE shares end in **.NS**, BSE in **.BO**. Recent headlines about that company show up automatically so you have context before you buy.
3. Choose when you bought it:
   - **Right now** — uses the live price
   - **Pick date & time** — uses the actual market price at that moment
4. The buy price fills in by itself. Type over it if your price was different (brokerage, different lot, etc.).
5. Choose **By quantity** if you know how many shares, or **By amount invested** if you only remember how much money you put in — the app works out the shares for you.
6. **Save holding.**

Switch between **₹ INR** and **$ USD** with the toggle in the portfolio header — everything converts at the live exchange rate.

Click any stock anywhere in the app (Hype Radar, Popular & Steady, or a holding) to see its price chart across 1D/5D/1M/6M/1Y/5Y and its latest related news.

Your holdings are stored **on your own device only** — in the app's data folder on PC, in the browser's storage on phone. There is no server holding your portfolio, and no way for anyone (including the developer) to see it.

---

## ❓ Common questions

**Is it really free?** Yes, permanently. No ads, no paid tier, no trial.

**Do I need an account?** No. There is no sign-up anywhere in the app.

**What does it collect?** A random number your device makes up for itself, so the developer can count how many people use it. No name, no email, no IP address, no cookie. Clearing your browser data resets it.

**Is this investment advice?** No. It shows market data and reads the tone of news headlines. The rise/fall labels are a reading of how a headline is worded — not a prediction, and not a recommendation to buy or sell anything.

**Why is my phone app not updating?** Close it fully and reopen — it updates itself in the background.

**Can I remove it?** Phone: long-press the icon → Remove. PC: normal Windows uninstall, or delete the portable file.

---

*PulseDesk · created by Dheerav Tandon · free and open source*
