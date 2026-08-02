'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, shell, screen, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const stocks = require('./src/services/stocks');
const crypto = require('./src/services/crypto');
const news = require('./src/services/news');
const portfolio = require('./src/services/portfolio');
const market = require('./src/services/market');
const mutualfunds = require('./src/services/mutualfunds');
const { appIcon } = require('./src/services/icon');

/** Bump when a stored setting must be forced back to its new default. */
const SETTINGS_VERSION = 3;

const DEFAULT_SETTINGS = {
  bounds: null,
  // Off by default: a window that outranks everything else makes the rest of the desktop
  // feel unusable. Turn it on deliberately from the tray or Settings.
  alwaysOnTop: false,
  opacity: 1,
  clickThrough: false,
  compact: false,
  showOnAllDesktops: false,
  theme: 'dark',
  hyperMarket: 'both',
  refresh: { fast: 60, medium: 300 },
  settingsVersion: SETTINGS_VERSION
};

let win = null;
let tray = null;
let settings = { ...DEFAULT_SETTINGS };
let settingsPath = null;
let payload = { meta: { errors: [] } };
let timers = [];
let iconImage = null;

/* ---------- settings ---------- */

/**
 * Settings written by older builds are merged over the defaults, so a value that used to
 * default to true stays true forever unless it is migrated. `settingsVersion` records how
 * far a file has been brought forward.
 *
 * The version is read from the file on disk, never from the merged object — the defaults
 * carry the current version, which would make every old file look already-migrated.
 */
function migrateSettings(merged, storedVersion) {
  if (storedVersion < SETTINGS_VERSION) {
    // Pinning is opt-in, and the weather tier no longer exists.
    merged.alwaysOnTop = false;
    merged.showOnAllDesktops = false;
    delete merged.weather;
    if (merged.refresh) delete merged.refresh.slow;
  }
  merged.settingsVersion = SETTINGS_VERSION;
  return merged;
}

function loadSettings() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    // No file yet: a fresh install already matches the current defaults.
    stored = { settingsVersion: SETTINGS_VERSION };
  }
  settings = migrateSettings({ ...DEFAULT_SETTINGS, ...stored }, Number(stored.settingsVersion) || 0);
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    /* first run may race the userData folder; the next save will catch up */
  }
  return settings;
}

function saveSettings(patch = {}) {
  settings = { ...settings, ...patch };
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('settings write failed', err.message);
  }
  return settings;
}

/* ---------- window ---------- */

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const saved = settings.bounds;
  const width = saved ? saved.width : Math.min(1240, area.width - 80);
  const height = saved ? saved.height : Math.min(960, area.height - 40);

  win = new BrowserWindow({
    width,
    height,
    x: saved ? saved.x : Math.max(0, area.width - width - 30),
    y: saved ? saved.y : 30,
    minWidth: 420,
    minHeight: 320,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    title: 'PulseDesk',
    icon: iconImage,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  applyWindowState();

  if (process.argv.includes('--dev')) {
    win.webContents.on('console-message', (_e, level, message, line, source) =>
      console.log(`[renderer] ${message} (${String(source).split('/').pop()}:${line})`)
    );
  }

  const persist = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    saveSettings({ bounds: win.getBounds() });
  };
  win.on('moved', persist);
  win.on('resized', persist);
  win.on('closed', () => (win = null));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function applyWindowState() {
  if (!win) return;
  // 'floating' sits above ordinary windows but still yields to fullscreen apps and system
  // UI. 'screen-saver' outranks everything, which is why the window used to stay stuck on
  // screen no matter what you switched to.
  win.setAlwaysOnTop(!!settings.alwaysOnTop, 'floating');
  win.setVisibleOnAllWorkspaces(!!settings.showOnAllDesktops, { visibleOnFullScreen: false });
  win.setOpacity(Number(settings.opacity) || 1);
  win.setIgnoreMouseEvents(!!settings.clickThrough, { forward: true });
}

function toggleWindow() {
  if (!win) return createWindow();
  if (win.isVisible() && win.isFocused()) win.hide();
  else {
    win.show();
    win.focus();
  }
}

/* ---------- data ---------- */

const broadcast = (patch) => {
  payload = { ...payload, ...patch, meta: { ...payload.meta, updatedAt: Date.now() } };
  if (win && !win.isDestroyed()) win.webContents.send('data:update', patch);
};

const errors = new Map();
async function guard(name, fn) {
  try {
    const value = await fn();
    errors.delete(name);
    return value;
  } catch (err) {
    errors.set(name, err.message);
    console.error(`[${name}]`, err.message);
    return null;
  }
}

const noteErrors = () => ({ errors: [...errors.entries()].map(([k, v]) => `${k}: ${v}`) });

async function refreshFast() {
  const [idx, pf, cryptoRows, traded, fng, glob] = await Promise.all([
    guard('indices', () => stocks.indices()),
    guard('portfolio', () => portfolio.valuate()),
    guard('crypto', () => crypto.pumped(10)),
    guard('cryptoTraded', () => crypto.mostTraded(10)),
    guard('fng', () => crypto.fearGreed()),
    guard('cryptoGlobal', () => crypto.globalStats())
  ]);

  const vix = idx ? (idx.find((i) => i.label === 'VIX') || {}).price : undefined;
  const b = market.breadth([...(idx || []), ...((payload.hyped || []))]);

  broadcast({
    indices: idx || payload.indices || [],
    portfolio: pf || payload.portfolio || null,
    crypto: {
      rows: cryptoRows || (payload.crypto && payload.crypto.rows) || [],
      traded: traded || (payload.crypto && payload.crypto.traded) || [],
      fng: fng || (payload.crypto && payload.crypto.fng) || null,
      global: glob || (payload.crypto && payload.crypto.global) || null
    },
    market: {
      sessions: market.sessions(),
      breadth: b,
      pulse: market.pulse({ breadth: b, vix, newsCounts: payload.news && payload.news.counts, fng })
    },
    meta: { ...noteErrors(), updatedAt: Date.now() }
  });
}

async function refreshMedium() {
  const feed = await guard('news', () => news.fetchAll(40));
  const mentions = (feed && feed.mentions) || {};
  const held = ((payload.portfolio && payload.portfolio.rows) || []).map((r) => r.symbol);
  const [hype, pop, funds] = await Promise.all([
    guard('hyped', () => stocks.hyped(mentions, held, settings.hyperMarket)),
    guard('popular', () => stocks.popular()),
    guard('funds', () => mutualfunds.popular())
  ]);

  broadcast({
    news: feed || payload.news || { items: [], counts: {} },
    hyped: (hype || payload.hyped || []).slice(0, 40),
    popular: pop || payload.popular || [],
    funds: funds || payload.funds || [],
    meta: { ...noteErrors(), updatedAt: Date.now() }
  });
}

function scheduleRefresh() {
  timers.forEach(clearInterval);
  const r = settings.refresh || DEFAULT_SETTINGS.refresh;
  timers = [
    setInterval(refreshFast, Math.max(20, r.fast) * 1000),
    setInterval(refreshMedium, Math.max(60, r.medium) * 1000)
  ];
}

async function refreshAll() {
  await Promise.all([refreshFast(), refreshMedium()]);
}

/* ---------- tray ---------- */

function trayMenu() {
  return Menu.buildFromTemplate([
      { label: `PulseDesk v${app.getVersion()} — created by Dheerav Tandon`, enabled: false },
      { type: 'separator' },
      { label: 'Show / Hide  (Ctrl+Alt+P)', click: toggleWindow },
      { label: 'Refresh now  (Ctrl+Alt+R)', click: refreshAll },
      { type: 'separator' },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: settings.alwaysOnTop,
        click: (i) => {
          saveSettings({ alwaysOnTop: i.checked });
          applyWindowState();
        }
      },
      {
        label: 'Click-through (widget mode)',
        type: 'checkbox',
        checked: settings.clickThrough,
        click: (i) => {
          saveSettings({ clickThrough: i.checked });
          applyWindowState();
          refreshTray();
        }
      },
      {
        label: 'Show on all desktops',
        type: 'checkbox',
        checked: settings.showOnAllDesktops,
        click: (i) => {
          saveSettings({ showOnAllDesktops: i.checked });
          applyWindowState();
        }
      },
      {
        label: 'Opacity',
        submenu: [1, 0.95, 0.85, 0.75, 0.6].map((o) => ({
          label: `${Math.round(o * 100)}%`,
          type: 'radio',
          checked: Math.abs((settings.opacity || 1) - o) < 0.01,
          click: () => {
            saveSettings({ opacity: o });
            applyWindowState();
          }
        }))
      },
      { type: 'separator' },
      {
        label: 'Reset position',
        click: () => {
          saveSettings({ bounds: null });
          if (win) win.close();
          createWindow();
          if (payload) win.webContents.once('did-finish-load', () => win.webContents.send('data:update', payload));
        }
      },
      { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
  ]);
}

/** Rebuilt whenever settings change so the checkboxes reflect reality. */
function refreshTray() {
  if (tray) tray.setContextMenu(trayMenu());
}

function buildTray() {
  tray = new Tray(iconImage.resize({ width: 16, height: 16 }));
  tray.setToolTip('PulseDesk — markets, portfolio, news · by Dheerav Tandon');
  refreshTray();
  tray.on('click', toggleWindow);
}

/* ---------- ipc ---------- */

function registerIpc() {
  ipcMain.handle('data:get', () => payload);
  ipcMain.handle('data:refresh', async () => {
    await refreshAll();
    return payload;
  });

  ipcMain.handle('portfolio:read', () => portfolio.read());
  ipcMain.handle('portfolio:add', async (_e, h) => {
    portfolio.addHolding(h);
    await refreshFast();
    return payload.portfolio;
  });
  ipcMain.handle('portfolio:update', async (_e, { id, patch }) => {
    portfolio.updateHolding(id, patch);
    await refreshFast();
    return payload.portfolio;
  });
  ipcMain.handle('portfolio:remove', async (_e, { id, sellPrice }) => {
    portfolio.removeHolding(id, sellPrice);
    await refreshFast();
    return payload.portfolio;
  });
  ipcMain.handle('portfolio:sell', async (_e, { id, sale }) => {
    portfolio.sellHolding(id, sale);
    await refreshFast();
    return payload.portfolio;
  });
  ipcMain.handle('portfolio:base', async (_e, cur) => {
    portfolio.setBase(cur);
    await refreshFast();
    return payload.portfolio;
  });
  ipcMain.handle('portfolio:cash', async (_e, amount) => {
    portfolio.setCash(amount);
    await refreshFast();
    return payload.portfolio;
  });
  ipcMain.handle('portfolio:import', async (_e, data) => {
    portfolio.replace(data);
    await refreshFast();
    return payload.portfolio;
  });

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', async (_e, patch) => {
    saveSettings(patch);
    applyWindowState();
    if (patch.refresh) scheduleRefresh();
    if (patch.hyperMarket) await refreshMedium();
    refreshTray();
    return settings;
  });

  ipcMain.handle('win:minimize', () => win && win.minimize());
  ipcMain.handle('win:hide', () => win && win.hide());
  ipcMain.handle('win:quit', () => app.quit());
  ipcMain.handle('win:toggleMaximize', () => {
    if (!win) return false;
    if (win.isFullScreen()) {
      win.setFullScreen(false);
      return false;
    }
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle('win:toggleFullscreen', () => {
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });
  ipcMain.handle('win:state', () => (win ? { maximized: win.isMaximized(), fullscreen: win.isFullScreen() } : {}));
  ipcMain.handle('shell:open', (_e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('search:quote', async (_e, symbol) => {
    try {
      return await stocks.chart(symbol, '1mo', '1d');
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('search:symbols', async (_e, query) => {
    try {
      return await stocks.search(query);
    } catch {
      return [];
    }
  });
  ipcMain.handle('search:priceAt', async (_e, { symbol, ts }) => {
    try {
      return await stocks.priceAt(symbol, ts);
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('search:history', async (_e, { symbol, range }) => {
    try {
      return await stocks.history(symbol, range);
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('search:fx', async (_e, { from, to }) => {
    try {
      return { rate: await stocks.fxRate(String(from || '').toUpperCase(), String(to || '').toUpperCase()) };
    } catch (err) {
      return { rate: 1, error: err.message };
    }
  });

  ipcMain.handle('report:pdf', (_e, { html, fileName }) => printStatement(html, fileName));
}

/**
 * The statement is rendered by Chromium itself: the renderer hands over a finished HTML
 * document, an off-screen window lays it out, and printToPDF returns real vector PDF bytes —
 * no PDF library, and nothing about the portfolio leaves the machine.
 */
async function printStatement(html, fileName) {
  const temp = path.join(app.getPath('temp'), `pulsedesk-statement-${Date.now()}.html`);
  let sheet = null;
  try {
    fs.writeFileSync(temp, String(html || ''), 'utf8');
    sheet = new BrowserWindow({
      show: false,
      webPreferences: { javascript: false, contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    await sheet.loadFile(temp);
    const pdf = await sheet.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.45, right: 0.45 }
    });

    const safe = String(fileName || 'PulseDesk-statement.pdf').replace(/[\\/:*?"<>|]/g, '-');
    const { canceled, filePath } = await dialog.showSaveDialog(win || undefined, {
      title: 'Save portfolio statement',
      defaultPath: path.join(app.getPath('documents'), safe),
      filters: [{ name: 'PDF document', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { canceled: true };

    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return { canceled: false, path: filePath };
  } catch (err) {
    return { canceled: true, error: err.message };
  } finally {
    if (sheet && !sheet.isDestroyed()) sheet.destroy();
    fs.unlink(temp, () => {});
  }
}

/* ---------- lifecycle ---------- */

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => win && (win.show(), win.focus()));

  app.whenReady().then(async () => {
    iconImage = nativeImage.createFromBuffer(appIcon(64));
    loadSettings();
    portfolio.init(app.getPath('userData'));
    registerIpc();
    createWindow();
    buildTray();

    globalShortcut.register('CommandOrControl+Alt+P', toggleWindow);
    globalShortcut.register('CommandOrControl+Alt+R', refreshAll);

    win.webContents.once('did-finish-load', () => {
      refreshFast();
      refreshMedium();
    });
    scheduleRefresh();
  });

  app.on('window-all-closed', () => {
    // Tray-resident widget: closing the window should not kill the app on Windows.
    if (process.platform === 'darwin') return;
  });

  app.on('activate', () => {
    if (!win) createWindow();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    timers.forEach(clearInterval);
  });
}
