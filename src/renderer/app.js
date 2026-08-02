'use strict';

const $ = (id) => document.getElementById(id);
const state = {
  data: {},
  newsFilter: 'ALL',
  cryptoTab: 'pumps',
  popFilter: 'ALL',
  sectorFilter: 'ALL',
  fundFilter: 'ALL',
  settings: {},
  base: 'INR',
  pick: null,
  priceInfo: null,
  priceManual: false,
  whenMode: 'now',
  qtyMode: 'qty',
  sugRows: [],
  sugIndex: -1,
  chartSym: null,
  charts: { main: null, buy: null },
  sell: null,
  session: null,
  theme: 'dark',
  // Amount-invested mode can be typed in a currency the share is not quoted in.
  payCur: 'NATIVE',
  payRate: 1
};

/* ---------------- helpers ---------------- */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', JPY: '¥' };

/** The minus sign belongs in front of the currency symbol, not between it and the digits. */
function money(v, cur = state.base, compact = false) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sym = (v < 0 ? '-' : '') + (SYMBOLS[cur] || `${cur} `);
  if (compact || abs >= 1e5) {
    if (cur === 'INR') {
      if (abs >= 1e7) return `${sym}${(abs / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `${sym}${(abs / 1e5).toFixed(2)} L`;
    }
    if (abs >= 1e9) return `${sym}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sym}${(abs / 1e6).toFixed(2)}M`;
  }
  return sym + abs.toLocaleString('en-IN', { minimumFractionDigits: abs < 100 ? 2 : 0, maximumFractionDigits: 2 });
}

const num = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pctS = (v, d = 2) => (v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const cls = (v) => (v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : 'flat');
const arrow = (v) => (v > 0.0001 ? '▲' : v < -0.0001 ? '▼' : '■');
const shortSym = (s) => String(s || '').replace('.NS', '').replace('.BO', '');

function bigNum(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function coinPrice(p) {
  if (!isFinite(p)) return '—';
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(3)}`;
  if (p >= 0.001) return `$${p.toFixed(5)}`;
  const fixed = p.toFixed(Math.min(12, Math.ceil(-Math.log10(p)) + 3));
  return `$${fixed.replace(/0+$/, '')}`;
}

const ago = (ts) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

const dateLabel = (ts) =>
  new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function spark(series, color, h = 30, fill = true) {
  const pts = (series || []).filter((v) => isFinite(v));
  if (pts.length < 2) return '<svg class="spark"></svg>';
  const w = 100;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const rng = hi - lo || 1;
  const step = w / (pts.length - 1);
  const coords = pts.map((v, i) => [i * step, h - 3 - ((v - lo) / rng) * (h - 6)]);
  const d = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  const area = fill ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.42"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${d} L${w},${h} L0,${h} Z" fill="url(#${id})"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${area}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/** Momentum-only "likely" read — not a forecast, just how volume + move are currently leaning. */
function likelyCall(changePct, strength = 1) {
  if (!isFinite(changePct)) return { text: 'Not enough data', cls: 'flat' };
  const s = isFinite(strength) ? strength : 1;
  if (changePct > 1.5 && s >= 1.3) return { text: 'Likely to keep rising', cls: 'up' };
  if (changePct < -1.5 && s >= 1.3) return { text: 'Likely to keep falling', cls: 'down' };
  if (Math.abs(changePct) < 0.4) return { text: 'Likely to stay flat', cls: 'flat' };
  return changePct > 0 ? { text: 'Leaning higher', cls: 'up' } : { text: 'Leaning lower', cls: 'down' };
}

/** Headlines already fetched for the News Wire, matched to one symbol by ticker or name. */
function relatedNews(row) {
  const items = (state.data.news && state.data.news.items) || [];
  if (!row || !row.symbol) return [];
  const sym = row.symbol.toUpperCase();
  const short = shortSym(sym).toUpperCase();
  const nameWords = (row.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
  return items
    .filter((i) => {
      if ((i.tickers || []).some((t) => t.toUpperCase() === sym || t.toUpperCase() === short)) return true;
      const title = i.title.toLowerCase();
      return nameWords.length > 0 && nameWords.every((w) => title.includes(w));
    })
    .slice(0, 3);
}

function newsListHtml(items) {
  if (!items.length) return '<div class="pn-empty">No recent headlines found for this one.</div>';
  return items
    .map((i) => {
      const k = i.direction === 'RISE' ? 'up' : i.direction === 'FALL' ? 'down' : 'flat';
      return `<div class="pn-item" data-link="${esc(i.link)}">
      <span class="pn-dir ${k}">${i.direction === 'RISE' ? '▲' : i.direction === 'FALL' ? '▼' : '■'}</span>
      <span class="pn-t">${esc(i.title)}</span>
    </div>`;
    })
    .join('');
}

/* ---------------- renderers ---------------- */

function renderTape(indices) {
  if (!indices || !indices.length) return;
  const one = indices
    .map((i) => {
      const c = cls(i.changePct);
      return `<span class="tick"><span class="t-l">${esc(i.label || i.symbol)}</span>
        <span class="t-p">${num(i.price, i.price > 1000 ? 0 : 2)}</span>
        <span class="t-c ${c}">${arrow(i.changePct)} ${pctS(i.changePct)}</span></span>`;
    })
    .join('');
  $('tapeTrack').innerHTML = one + one;
}

function renderPulse(m) {
  const chip = $('pulseChip');
  if (!m || !m.pulse) return;
  const { score, mood } = m.pulse;
  const c = score > 12 ? 'var(--up)' : score < -12 ? 'var(--down)' : 'var(--gold)';
  chip.style.color = c;
  chip.style.borderColor = c;
  const b = m.breadth || {};
  chip.textContent = `${mood} ${score > 0 ? '+' : ''}${score} · ${b.advancers || 0}▲/${b.decliners || 0}▼`;
}

function renderHype(rows) {
  const el = $('hypeGrid');
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">Scanning the tape for unusual volume…</div>';
    return;
  }
  const top = rows.slice(0, 5);
  $('hypeMeta').textContent = `${rows.length} scanned`;
  el.innerHTML = top
    .map((r, i) => {
      const col = cssVar(r.changePct >= 0 ? '--up' : '--down', '#17e29a');
      const cur = SYMBOLS[r.currency] || '';
      const call = likelyCall(r.changePct, r.volumeRatio);
      return `<div class="hype" data-sym="${esc(r.symbol)}" data-name="${esc(r.name || '')}">
        <span class="rank">#${i + 1}</span>
        <div>
          <div class="sym">${esc(shortSym(r.symbol))}</div>
          <div class="nm">${esc(r.name || '')}</div>
        </div>
        <div class="px"><b>${cur}${num(r.price, r.price > 1000 ? 0 : 2)}</b><span class="${cls(r.changePct)}">${pctS(r.changePct, 1)}</span></div>
        ${spark(r.series, col)}
        <div class="meter"><i style="width:${Math.max(6, r.hype)}%"></i></div>
        <div class="why"><b>${r.hype}</b> · ${esc(r.reason)}</div>
        <div class="call ${call.cls}">${esc(call.text)}</div>
      </div>`;
    })
    .join('');
}

function renderHypeAll() {
  const rows = state.data.hyped || [];
  $('hypeAllCount').textContent = `(${rows.length} scanned)`;
  $('hypeAllList').innerHTML = rows.length
    ? rows
        .map((r, i) => {
          const call = likelyCall(r.changePct, r.volumeRatio);
          const cur = SYMBOLS[r.currency] || '';
          return `<div class="ha-row" data-sym="${esc(r.symbol)}" data-name="${esc(r.name || '')}">
        <span class="ha-rank">#${i + 1}</span>
        <div class="ha-nm"><b>${esc(shortSym(r.symbol))}</b><span>${esc(r.name || '')}</span></div>
        <span class="ha-px ${cls(r.changePct)}">${cur}${num(r.price, r.price > 1000 ? 0 : 2)} <small>${pctS(r.changePct, 1)}</small></span>
        <span class="ha-hs">${r.hype}</span>
        <span class="ha-call ${call.cls}">${esc(call.text)}</span>
      </div>`;
        })
        .join('')
    : '<div class="empty">Scanning the tape…</div>';
}

function renderPortfolio(pf) {
  if (!pf) return;
  const t = pf.totals;
  state.base = t.baseCurrency;
  $('baseCur').value = t.baseCurrency;
  document.querySelectorAll('#curToggle button').forEach((b) => b.classList.toggle('active', b.dataset.cur === t.baseCurrency));
  $('pfSub').textContent = `${t.positions} position${t.positions === 1 ? '' : 's'} · ${t.winners}▲ ${t.losers}▼`;
  $('holdCount').textContent = t.positions ? `· ${t.positions}` : '';
  $('tradeCount').textContent = t.tradeCount ? `· ${t.tradeCount}` : '';

  $('pfNet').textContent = money(t.netWorth);
  const d = $('pfDay');
  d.className = `d ${cls(t.dayPnl)}`;
  // Positions opened today are measured from their buy price, so say so rather than
  // implying they lived through a session they were never in.
  const dayNote = t.dayFromBuy ? ' since you bought' : t.openedToday ? ` (${t.openedToday} bought today)` : '';
  d.textContent = `${arrow(t.dayPnl)} ${money(t.dayPnl)} today${dayNote} ${pctS(t.dayPnlPct)}`;

  const hist = (pf.history || []).map((h) => h.value);
  $('pfSpark').innerHTML = hist.length > 1
    ? spark(hist, cssVar(t.unrealised >= 0 ? '--up' : '--down', '#17e29a'), 48)
    : '<div class="empty" style="padding:6px;font-size:9.5px">Value history builds as the app runs</div>';

  // Headline "money made": everything still held plus everything already sold.
  $('pfEarned').innerHTML = `
    <div class="pe-main">
      <span class="k">Total money made</span>
      <span class="v ${cls(t.totalPnl)}">${money(t.totalPnl)}</span>
      <span class="s ${cls(t.totalPnl)}">${pctS(t.totalPnlPct)} on ${money(t.totalCost)} put in</span>
    </div>
    <div class="pe-split">
      <div class="pe-part">
        <span class="k">On paper</span>
        <b class="${cls(t.unrealised)}">${money(t.unrealised)}</b>
        <span class="s">${pctS(t.unrealisedPct, 1)} · still held</span>
      </div>
      <div class="pe-part">
        <span class="k">Banked</span>
        <b class="${cls(t.realised)}">${money(t.realised)}</b>
        <span class="s">${t.tradeCount ? `${t.tradeCount} sold · ${t.winRate != null ? Math.round(t.winRate) : 0}% won` : 'nothing sold yet'}</span>
      </div>
    </div>`;

  const stats = [
    ['Invested', money(t.invested), `${t.positions} holding${t.positions === 1 ? '' : 's'} open`],
    ['Market value', money(t.value), t.cash ? `+ ${money(t.cash)} cash` : 'what it is worth now'],
    ['Best open', t.best ? shortSym(t.best.symbol) : '—', t.best ? pctS(t.best.pnlPct, 1) : 'no holdings', t.best ? cls(t.best.pnl) : ''],
    ['Best sale', t.bestTrade ? shortSym(t.bestTrade.symbol) : '—', t.bestTrade ? money(t.bestTrade.pnl) : 'no sales yet', t.bestTrade ? cls(t.bestTrade.pnl) : '']
  ];
  $('pfStats').innerHTML = stats
    .map(([k, v, s, c]) => `<div class="stat"><span class="k">${esc(k)}</span><span class="v ${c || ''}">${esc(v)}</span><span class="s">${esc(s)}</span></div>`)
    .join('');

  renderClosed(pf.trades || []);

  const COLORS = ['#7c5cff', '#21d4fd', '#17e29a', '#ffc44d', '#ff4d6d', '#ff8ad4', '#5ce1e6', '#b58cff'];
  const rows = pf.rows || [];
  if (rows.length) {
    let acc = 0;
    const R = 40;
    const C = 2 * Math.PI * R;
    const arcs = rows
      .slice(0, 8)
      .map((r, i) => {
        const frac = Math.max(0, r.weight / 100);
        const seg = `<circle cx="46" cy="46" r="${R}" fill="none" stroke="${COLORS[i % COLORS.length]}"
          stroke-width="11" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}"
          stroke-dashoffset="${(-acc * C).toFixed(2)}" />`;
        acc += frac;
        return seg;
      })
      .join('');
    $('donut').innerHTML = `<svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="${R}" fill="none" stroke="${cssVar('--surf-3', 'rgba(255,255,255,0.09)')}" stroke-width="11"/>${arcs}</svg>
      <div class="mid"><b class="${cls(t.unrealised)}">${pctS(t.unrealisedPct, 1)}</b><span>RETURN</span></div>`;
    $('allocLegend').innerHTML = rows
      .slice(0, 8)
      .map((r, i) => `<div class="leg"><i style="background:${COLORS[i % COLORS.length]}"></i><span>${esc(shortSym(r.symbol))}</span><b>${r.weight.toFixed(1)}%</b></div>`)
      .join('');
  } else {
    $('donut').innerHTML = '';
    $('allocLegend').innerHTML = '';
  }

  $('holdings').innerHTML = rows.length
    ? rows
        .map((r) => {
          const since = r.buyDate
            ? `since ${new Date(r.buyDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}${r.heldDays != null ? ` · ${r.heldDays}d` : ''}`
            : '';
          return `<div class="hold" data-id="${esc(r.id)}" data-sym="${esc(r.symbol)}" data-name="${esc(r.name || '')}">
      <div class="h-l">
        <div class="h-s">${esc(shortSym(r.symbol))} <span class="${cls(r.changePct)}" style="font-size:9px">${pctS(r.changePct, 1)}</span></div>
        <div class="h-q">${num(r.qty, r.qty % 1 ? 4 : 0)} @ ${money(r.avgPrice, r.currency)} → ${money(r.price, r.currency)}${r.live ? '' : ' (stale)'}</div>
        <div class="h-since">${esc(since)}</div>
      </div>
      <div><div class="h-v">${money(r.value)}</div><div class="h-sub">inv ${money(r.invested)}</div></div>
      <div><div class="h-p ${cls(r.pnl)}">${money(r.pnl)}</div><div class="h-sub ${cls(r.pnl)}">${pctS(r.pnlPct, 1)}</div></div>
      <div class="h-acts">
        <button class="h-sell" data-sell="${esc(r.id)}" title="Sell some or all of this">Sell</button>
        <button class="x" data-del="${esc(r.id)}" title="Delete this row without booking a sale">×</button>
      </div>
    </div>`;
        })
        .join('')
    : '<div class="empty">No holdings yet.<br/>Hit <b>+ Add holding</b> and start typing a company name.</div>';
}

/** Closed positions — what was sold, when, and what it actually made. */
function renderClosed(trades) {
  const el = $('closedList');
  if (!el) return;
  el.innerHTML = trades.length
    ? trades
        .map((t) => {
          const when = new Date(t.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
          return `<div class="hold closed">
      <div class="h-l">
        <div class="h-s">${esc(shortSym(t.symbol))} <span class="sold-chip">SOLD</span></div>
        <div class="h-q">${num(t.qty, t.qty % 1 ? 4 : 0)} @ ${money(t.buyPrice, t.currency || state.base)} → ${money(t.sellPrice, t.currency || state.base)}</div>
        <div class="h-since">${esc(when)}${t.fees ? ` · ${money(t.fees, t.currency || state.base)} charges` : ''}</div>
      </div>
      <div><div class="h-v">${money(t.proceeds)}</div><div class="h-sub">cost ${money(t.cost)}</div></div>
      <div><div class="h-p ${cls(t.pnl)}">${money(t.pnl)}</div><div class="h-sub ${cls(t.pnl)}">${pctS(t.pnlPct, 1)}</div></div>
    </div>`;
        })
        .join('')
    : '<div class="empty">Nothing sold yet.<br/>Hit <b>Sell</b> on a holding and the profit shows up here.</div>';
}

function renderCrypto(c) {
  if (!c) return;
  const tab = state.cryptoTab;
  const rows = tab === 'traded' ? c.traded || [] : c.rows || [];
  $('cryptoSub').textContent = tab === 'traded' ? 'most bought & sold · 24h turnover' : 'last 5 hours · top 10';

  $('cryptoList').innerHTML = rows.length
    ? rows
        .map((r, i) => {
          const main = tab === 'traded' ? r.change24h : r.change5h;
          const subLine = tab === 'traded'
            ? `${esc(r.name)} · ${bigNum(r.trades24h)} trades`
            : `${esc(r.name)} · vol ${bigNum(r.volume5hUsd)}`;
          const subVal = tab === 'traded' ? `$${bigNum(r.volume24hUsd)}` : `24h ${pctS(r.change24h, 1)}`;
          return `<div class="cx" style="border-left-color:${main >= 0 ? 'var(--up)' : 'var(--down)'}">
      <span class="n">${i + 1}</span>
      <div style="min-width:0"><div class="s">${esc(r.symbol)}</div><div class="nm2">${subLine}</div></div>
      <div class="p">${coinPrice(r.price)}</div>
      <div class="c ${cls(main)}">${pctS(main, 1)}<small>${subVal}</small></div>
    </div>`;
        })
        .join('')
    : '<div class="empty">Loading crypto…</div>';

  const bits = [];
  if (c.fng) {
    const f = c.fng;
    const col = f.value >= 60 ? 'var(--up)' : f.value <= 40 ? 'var(--down)' : 'var(--gold)';
    bits.push(`Fear &amp; Greed <b style="color:${col}">${f.value} ${esc(f.label)}</b>`);
  }
  if (c.global) {
    bits.push(`Mcap <b>$${bigNum(c.global.marketCapUsd)}</b>`);
    bits.push(`BTC dom <b>${num(c.global.btcDominance, 1)}%</b>`);
    bits.push(`24h <b class="${cls(c.global.capChange24h)}">${pctS(c.global.capChange24h, 1)}</b>`);
  }
  $('cryptoFoot').innerHTML = bits.join(' · ');
}

function renderPopular(rows) {
  const el = $('popList');
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">Loading the steady names…</div>';
    return;
  }
  const sel = $('popSector');
  if (sel && sel.options.length <= 1) {
    const sectors = [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort();
    sel.innerHTML = '<option value="ALL">All sectors</option>' + sectors.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }
  const f = state.popFilter;
  const list = rows.filter(
    (r) =>
      (f === 'ALL' ? true : f === 'IN' ? /\.(NS|BO)$/.test(r.symbol) : !/\.(NS|BO)$/.test(r.symbol)) &&
      (state.sectorFilter === 'ALL' || r.sector === state.sectorFilter)
  );
  const band = (s) => (s === 'very steady' ? 'st-very' : s === 'steady' ? 'st-steady' : s === 'moves a lot' ? 'st-moves' : 'st-vol');

  el.innerHTML = list.length
    ? list
        .map((r) => {
          const cur = SYMBOLS[r.currency] || '';
          return `<div class="pop" data-sym="${esc(r.symbol)}" data-name="${esc(r.name)}">
      <div style="min-width:0">
        <div class="s">${esc(shortSym(r.symbol))} <span class="${cls(r.changePct)}" style="font-size:9px">${pctS(r.changePct, 1)}</span></div>
        <div class="t">${esc(r.tag)} · ${esc(r.name)}</div>
      </div>
      <div class="px2">${cur}${num(r.price, r.price > 1000 ? 0 : 2)}<small>${r.volatility == null ? '' : `vol ${num(r.volatility, 0)}%`}</small></div>
      <div class="yr ${cls(r.yearPct)}">${pctS(r.yearPct, 0)}<small>1 year</small></div>
      <span class="st ${band(r.stability)}">${esc(r.stability)}</span>
      <button class="add" data-add="${esc(r.symbol)}" title="Add to portfolio">+</button>
    </div>`;
        })
        .join('')
    : '<div class="empty">Nothing in this filter.</div>';
}

function renderFunds(rows) {
  const el = $('fundList');
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty">Loading fund NAVs…</div>';
    return;
  }
  const f = state.fundFilter;
  const list = rows.filter((r) => f === 'ALL' || r.category === f);
  el.innerHTML = list.length
    ? list
        .map(
          (r) => `<div class="fund">
      <div style="min-width:0">
        <div class="s">${esc(r.name)}</div>
        <div class="t">${esc(r.category)} · ${esc(r.fundHouse || '')}</div>
      </div>
      <div class="px2">₹${num(r.nav)}<small>NAV</small></div>
      <div class="yr ${cls(r.dayChangePct)}">${pctS(r.dayChangePct, 2)}<small>1 day</small></div>
      <div class="yr ${cls(r.yearChangePct)}">${pctS(r.yearChangePct, 0)}<small>1 year</small></div>
    </div>`
        )
        .join('')
    : '<div class="empty">Nothing in this filter.</div>';
}

function renderSessions(m) {
  if (!m || !m.sessions) return;
  $('sessions').innerHTML = m.sessions
    .map(
      (s, i) => `<div class="ses" data-ses="${i}" title="Open the full trading schedule for ${esc(s.name)}">
      <div class="ses-top">
        <span class="st ${s.isOpen ? 'on' : 'off'}"></span>
        <span class="nm3">${esc(s.name)}</span>
        <span class="ses-badge ${s.isOpen ? 'on' : 'off'}">${s.isOpen ? 'OPEN' : 'CLOSED'}</span>
      </div>
      <span class="lt">${esc(s.clock)}</span>
      <span class="cd">${esc(s.countdown)}</span>
    </div>`
    )
    .join('');
  if (state.session) {
    const fresh = m.sessions.find((s) => s.name === state.session.name);
    if (fresh) {
      state.session = fresh;
      if (!$('modalSession').hidden) renderSession();
    }
  }
}

/* ---------------- market session detail ---------------- */

const localTime = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const localDay = (ts) => new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

function humanMins(mins) {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Counted from the absolute bell timestamps, so it stays live between data refreshes. */
function sessionCountdown(s) {
  if (s.always) return 'Trades non-stop, every day of the year';
  const target = s.isOpen ? s.nextCloseTs : s.nextOpenTs;
  if (!target) return s.countdown;
  const mins = Math.max(0, Math.round((target - Date.now()) / 60000));
  return `${s.isOpen ? 'Closes in' : 'Opens in'} ${humanMins(mins)}`;
}

function openSession(index) {
  const s = ((state.data.market && state.data.market.sessions) || [])[index];
  if (!s) return;
  state.session = s;
  $('modalSession').hidden = false;
  renderSession();
}

function renderSession() {
  const s = state.session;
  if (!s) return;

  $('seName').textContent = s.name;
  const where = s.always ? s.country : `${s.city}, ${s.country}`;
  $('seWhere').textContent = `${where} · ${s.tz}${s.tzOffset ? ` (${s.tzOffset})` : ''}`;

  $('seNow').innerHTML = `
    <div class="se-clock">
      <span class="k">Time in ${esc(s.city)}</span>
      <b>${esc(s.clock)}</b>
      <span class="s">${esc(s.weekday)}${s.tradingToday || s.always ? '' : ' · not a trading day'}</span>
    </div>
    <div class="se-state ${s.isOpen ? 'on' : 'off'}">
      <b>${s.isOpen ? 'OPEN' : 'CLOSED'}</b>
      <span>${esc(sessionCountdown(s))}</span>
    </div>`;

  // The exchange's own midnight-to-midnight day, with the session band and a "now" marker.
  if (s.always) {
    $('seBar').innerHTML = '<div class="se-track"><i style="left:0;width:100%"></i></div><div class="se-scale"><em>always open</em></div>';
  } else {
    const openM = toMinutes(s.openLabel);
    const closeM = toMinutes(s.closeLabel);
    const nowM = toMinutes(s.clock);
    $('seBar').innerHTML = `<div class="se-track">
        <i class="${s.isOpen ? 'on' : 'off'}" style="left:${((openM / 1440) * 100).toFixed(2)}%;width:${(((closeM - openM) / 1440) * 100).toFixed(2)}%"></i>
        <span class="se-nowdot" style="left:${((nowM / 1440) * 100).toFixed(2)}%" title="right now in ${esc(s.city)}"></span>
      </div>
      <div class="se-scale"><em>00:00</em><em>06:00</em><em>12:00</em><em>18:00</em><em>24:00</em></div>`;
  }

  const nextBell = s.isOpen ? s.nextCloseTs : s.nextOpenTs;
  const cells = [
    ['Trading days', s.daysLabel, s.always ? 'weekends included' : 'exchange holidays excluded'],
    ['Opening bell', s.openLabel, s.nextOpenTs ? `${localTime(s.nextOpenTs)} where you are` : 'no opening bell'],
    ['Closing bell', s.closeLabel, s.nextCloseTs ? `${localTime(s.nextCloseTs)} where you are` : 'never closes'],
    ['Session length', s.always ? 'Continuous' : humanMins(s.sessionMinutes), s.always ? '24 hours a day' : 'per trading day'],
    [
      s.isOpen ? 'Bell rings next' : 'Opens next',
      s.always ? '—' : nextBell ? localDay(nextBell) : '—',
      s.always ? 'no schedule' : nextBell ? `${localTime(nextBell)} your time` : ''
    ],
    ['Time zone', s.tzOffset || s.tz, s.tz]
  ];

  $('seGrid').innerHTML = cells
    .map(([k, v, sub]) => `<div class="se-cell"><span class="k">${esc(k)}</span><b>${esc(v)}</b><span class="s">${esc(sub || '')}</span></div>`)
    .join('');
}

function renderNews(n) {
  if (!n) return;
  const all = n.items || [];
  const items = all.filter((i) => state.newsFilter === 'ALL' || i.direction === state.newsFilter);
  const c = n.counts || {};
  const sub = $('newsSub');
  if (sub) sub.textContent = `${all.length} headlines · direction call`;
  const tot = Math.max(1, (c.bullish || 0) + (c.bearish || 0) + (c.neutral || 0));
  $('newsBar').innerHTML = `<span>${c.scanned || 0} scanned</span>
    <span class="news-seg">
      <i style="width:${((c.bullish || 0) / tot) * 100}%;background:var(--up)"></i>
      <i style="width:${((c.neutral || 0) / tot) * 100}%;background:var(--flat)"></i>
      <i style="width:${((c.bearish || 0) / tot) * 100}%;background:var(--down)"></i>
    </span>
    <span class="up">${c.bullish || 0} rise</span><span class="down">${c.bearish || 0} fall</span>`;

  $('newsList').innerHTML = items.length
    ? items
        .map((i) => {
          const k = i.direction === 'RISE' ? 'rise' : i.direction === 'FALL' ? 'fall' : 'flat';
          const col = k === 'rise' ? 'var(--up)' : k === 'fall' ? 'var(--down)' : 'var(--flat)';
          const likely = i.direction === 'RISE' ? 'Likely to rise' : i.direction === 'FALL' ? 'Likely to fall' : 'Reads flat';
          return `<div class="nw ${k}" data-link="${esc(i.link)}">
        <div class="dir">
          <span class="a" style="color:${col}">${i.direction === 'RISE' ? '▲' : i.direction === 'FALL' ? '▼' : '■'}</span>
          <span class="cf">${i.confidence}%</span>
          <span class="cbar"><i style="width:${i.confidence}%;background:${col}"></i></span>
        </div>
        <div>
          <div class="h">${esc(i.title)}</div>
          <div class="m">
            <span class="likely" style="color:${col}">${esc(likely)}</span>
            <span class="src">${esc(i.source)}</span><span>${esc(ago(i.ts))}</span>
            ${(i.tickers || []).slice(0, 4).map((t) => `<span class="tk">${esc(shortSym(t))}</span>`).join('')}
            ${i.hedged ? '<span>speculative</span>' : ''}
            ${(i.hits || []).length ? `<span>signal: ${esc(i.hits.slice(0, 2).join(', '))}</span>` : ''}
          </div>
        </div>
      </div>`;
        })
        .join('')
    : '<div class="empty">No headlines in this filter.</div>';
}

function renderStatus(meta) {
  if (!meta) return;
  $('stamp').textContent = meta.updatedAt ? `updated ${ago(meta.updatedAt)}` : 'syncing…';
  const errs = meta.errors || [];
  $('errBar').textContent = errs.length ? errs.slice(0, 2).join(' · ') : '';
}

function render(patch) {
  const d = (state.data = { ...state.data, ...patch });
  if (patch.indices) renderTape(d.indices);
  if (patch.hyped) renderHype(d.hyped);
  if (patch.portfolio) renderPortfolio(d.portfolio);
  if (patch.crypto) renderCrypto(d.crypto);
  if (patch.popular) renderPopular(d.popular);
  if (patch.funds) renderFunds(d.funds);
  if (patch.market) {
    renderSessions(d.market);
    renderPulse(d.market);
  }
  if (patch.news) renderNews(d.news);
  if (patch.meta) renderStatus(d.meta);
}

/* ---------------- add-holding flow ---------------- */

const buyTimestamp = () => {
  if (state.whenMode === 'now') return Date.now();
  const v = $('fWhen').value;
  const t = v ? new Date(v).getTime() : NaN;
  return isFinite(t) ? Math.min(t, Date.now()) : Date.now();
};

function renderSuggestions() {
  const box = $('suggest');
  if (!state.sugRows.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = state.sugRows
    .map(
      (r, i) => `<div class="sug${i === state.sugIndex ? ' on' : ''}" data-i="${i}">
      <div style="min-width:0"><div class="nm">${esc(r.name)}</div><div class="ex">${esc(r.region || r.exchange)}</div></div>
      <div><span class="sy">${esc(r.symbol)}</span><span class="ty">${esc(r.type)}</span></div>
    </div>`
    )
    .join('');
}

async function pickSymbol(row) {
  state.pick = row;
  state.priceManual = false;
  state.sugRows = [];
  state.sugIndex = -1;
  renderSuggestions();
  $('fSymbol').value = '';
  $('picked').hidden = false;
  $('picked').innerHTML = `<b>${esc(row.symbol)}</b><span>${esc(row.name)}</span>
    <span style="color:var(--txt-mute);font-size:10px">${esc(row.region || row.exchange || '')}</span>
    <button class="clear" id="clearPick" title="Choose a different one">×</button>`;
  $('clearPick').addEventListener('click', resetPick);
  const news = relatedNews(row);
  $('pickNews').hidden = false;
  $('pickNews').innerHTML = `<div class="pn-head">Recent news on ${esc(shortSym(row.symbol))}</div>${newsListHtml(news)}`;
  $('pickActions').hidden = false;
  if (!$('buyChart').hidden) toggleBuyChart(true);
  await fetchBuyPrice();
}

function resetPick() {
  state.pick = null;
  state.priceInfo = null;
  state.priceManual = false;
  state.payCur = 'NATIVE';
  state.payRate = 1;
  state.charts.buy = null;
  $('picked').hidden = true;
  $('picked').innerHTML = '';
  $('pickNews').hidden = true;
  $('pickNews').innerHTML = '';
  $('pickActions').hidden = true;
  $('buyChart').hidden = true;
  $('btnBuyChart').textContent = 'Show graph';
  $('payRow').hidden = true;
  $('fAvg').value = '';
  $('fSymbol').value = '';
  $('fSymbol').focus();
  setPriceTag('auto', 'auto');
  updatePreview();
}

/** The same chart engine as the stock modal, folded into the buy dialog on demand. */
async function toggleBuyChart(open) {
  const show = open != null ? open : $('buyChart').hidden;
  $('buyChart').hidden = !show;
  $('btnBuyChart').textContent = show ? 'Hide graph' : 'Show graph';
  if (!show || !state.pick) return;
  document.querySelectorAll('#bcRange button').forEach((b) => b.classList.toggle('active', b.dataset.r === '1D'));
  await loadChart('buy', state.pick.symbol, '1D');
}

function setPriceTag(text, kind) {
  const el = $('priceTag');
  el.textContent = text;
  el.className = `auto-tag${kind === 'manual' ? ' manual' : kind === 'loading' ? ' loading' : ''}`;
}

async function fetchBuyPrice() {
  if (!state.pick) return;
  if (state.priceManual) return updatePreview();
  setPriceTag('fetching…', 'loading');
  const ts = buyTimestamp();
  const info = await window.pulse.priceAt(state.pick.symbol, ts);
  if (!info || info.error || !isFinite(info.price)) {
    setPriceTag('type it in', 'manual');
    state.priceInfo = null;
    return updatePreview();
  }
  state.priceInfo = info;
  $('fAvg').value = Number(info.price.toFixed(info.price < 10 ? 6 : 2));
  setPriceTag(state.whenMode === 'now' ? 'live price' : info.exact ? 'price at that time' : 'nearest trading time', 'auto');
  await refreshPayFx();
  updatePreview();
}

const nativeCur = () => (state.priceInfo && state.priceInfo.currency) || '';
const payCurrency = () => (state.payCur === 'NATIVE' ? nativeCur() : state.payCur);

/**
 * A share quoted in dollars can still be bought with rupees — the amount is converted at the
 * live rate before it is divided by the price, so "₹50,000 of AMZN" gives the right unit count.
 */
function showPayRow() {
  const native = nativeCur();
  const row = $('payRow');
  const useful = state.qtyMode === 'amount' && !!native && native !== 'INR';
  row.hidden = !useful;
  if (!useful) {
    state.payCur = 'NATIVE';
    state.payRate = 1;
    return;
  }
  row.querySelector('[data-pay="NATIVE"]').textContent = `${SYMBOLS[native] || ''} ${native}`.trim();
  document.querySelectorAll('#payCur button').forEach((b) => b.classList.toggle('active', b.dataset.pay === state.payCur));
}

async function refreshPayFx() {
  showPayRow();
  const native = nativeCur();
  const pay = payCurrency();
  if (!native || !pay || pay === native) {
    state.payRate = 1;
    $('payFx').textContent = '';
    return;
  }
  $('payFx').textContent = 'converting…';
  const r = await window.pulse.fx(pay, native).catch(() => null);
  const rate = r && isFinite(r.rate) && r.rate > 0 ? r.rate : null;
  state.payRate = rate || 1;
  const back = rate ? 1 / rate : null;
  $('payFx').textContent = back
    ? `${SYMBOLS[native] || native}1 ≈ ${SYMBOLS[pay] || pay}${num(back, back >= 100 ? 2 : 4)}`
    : 'live rate unavailable — treating it as 1:1';
}

/** In "by amount" mode the field holds money, not shares — the quantity is derived from the price. */
function effectiveQty() {
  const raw = parseFloat($('fQty').value);
  const price = parseFloat($('fAvg').value);
  if (!isFinite(raw) || raw <= 0) return NaN;
  if (state.qtyMode === 'amount') {
    const spend = raw * (state.payRate || 1);
    return isFinite(price) && price > 0 ? spend / price : NaN;
  }
  return raw;
}

async function updatePreview() {
  const el = $('investPreview');
  const qty = effectiveQty();
  const price = parseFloat($('fAvg').value);
  if (!state.pick) {
    el.innerHTML = '<span class="muted">Pick a company above and the price fills in by itself.</span>';
    return;
  }
  if (!isFinite(qty) || qty <= 0 || !isFinite(price)) {
    el.innerHTML = `<span class="muted">${state.qtyMode === 'amount' ? 'Enter an amount to see how many shares that buys.' : 'Enter a quantity to see what this costs.'}</span>`;
    return;
  }

  const cur = nativeCur();
  const sym = SYMBOLS[cur] || '';
  const invested = qty * price;
  const when = state.whenMode === 'now' ? 'right now' : state.priceInfo ? dateLabel(state.priceInfo.at) : 'that date';
  const pay = payCurrency();
  const paySym = SYMBOLS[pay] || '';
  const converted = state.qtyMode === 'amount' && pay && pay !== cur;
  const qtyLine =
    state.qtyMode === 'amount'
      ? `<b>${paySym}${num(parseFloat($('fQty').value))}</b>${converted ? ` <span class="muted">(${sym}${num(invested)})</span>` : ''}
         buys <b>≈${num(qty, 4)}</b> shares of <b>${esc(shortSym(state.pick.symbol))}</b>`
      : `Buying <b>${num(qty, qty % 1 ? 4 : 0)}</b> of <b>${esc(shortSym(state.pick.symbol))}</b> = <b>${sym}${num(invested)}</b> invested`;

  let line2 = '';
  if (state.whenMode === 'past') {
    const live = await window.pulse.lookup(state.pick.symbol).catch(() => null);
    if (live && !live.error && isFinite(live.price)) {
      const changePct = ((live.price - price) / price) * 100;
      const gain = qty * (live.price - price);
      line2 = `<br/>Now <b>${sym}${num(live.price)}</b> → <b class="${cls(gain)}">${gain >= 0 ? '+' : ''}${sym}${num(Math.abs(gain))}</b>
        <span class="${cls(changePct)}">(${pctS(changePct, 1)})</span> since you bought`;
    }
  }

  el.innerHTML = `${qtyLine} at <b>${sym}${num(price)}</b> (${esc(when)})${line2}`;
}

function setQtyMode(mode) {
  state.qtyMode = mode;
  document.querySelectorAll('#qtyMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  const label = $('qtyLabelWrap');
  const input = $('fQty');
  if (mode === 'amount') {
    label.firstChild.textContent = 'Amount invested ';
    input.placeholder = 'e.g. 50000';
  } else {
    label.firstChild.textContent = 'Quantity ';
    input.placeholder = '10';
  }
  showPayRow();
}

/* ---------------- sell flow ---------------- */

const sellTimestamp = () => {
  if (state.sellWhen === 'now') return Date.now();
  const v = $('sWhen').value;
  const t = v ? new Date(v).getTime() : NaN;
  return isFinite(t) ? Math.min(t, Date.now()) : Date.now();
};

function openSell(id) {
  const row = ((state.data.portfolio && state.data.portfolio.rows) || []).find((r) => r.id === id);
  if (!row) return;
  state.sell = row;
  state.sellWhen = 'now';
  state.sellMode = 'qty';
  state.sellPriceManual = false;

  $('modalSell').hidden = false;
  $('sellHead').innerHTML = `<b>${esc(shortSym(row.symbol))}</b> <span>${esc(row.name || '')}</span>
    <span class="sh-hold">You hold <b>${num(row.qty, row.qty % 1 ? 4 : 0)}</b> at <b>${money(row.avgPrice, row.currency || state.base)}</b> average
    ${row.currency && row.currency !== state.base ? `<span class="muted">— priced in ${esc(row.currency)}</span>` : ''}</span>`;

  $('sQty').value = '';
  $('sFees').value = '';
  $('sWhen').value = '';
  $('sellWhenWrap').hidden = true;
  document.querySelectorAll('#sellWhenToggle button').forEach((b) => b.classList.toggle('active', b.dataset.when === 'now'));
  setSellMode('qty');
  fetchSellPrice();
}

function setSellMode(mode) {
  state.sellMode = mode;
  document.querySelectorAll('#sellQtyMode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  const label = $('sellQtyLabel');
  const input = $('sQty');
  if (mode === 'all') {
    // Selling out entirely: the quantity is fixed, so the field only gets in the way.
    input.value = state.sell ? state.sell.qty : '';
    input.disabled = true;
    label.firstChild.textContent = 'Quantity (everything) ';
  } else {
    input.disabled = false;
    label.firstChild.textContent = mode === 'amount' ? 'Amount received ' : 'Quantity ';
    input.placeholder = mode === 'amount' ? 'e.g. 50000' : '10';
  }
  updateSellPreview();
}

function setSellPriceTag(text, kind) {
  const el = $('sellPriceTag');
  el.textContent = text;
  el.className = `auto-tag${kind === 'manual' ? ' manual' : kind === 'loading' ? ' loading' : ''}`;
}

async function fetchSellPrice() {
  if (!state.sell) return;
  if (state.sellPriceManual) return updateSellPreview();
  setSellPriceTag('fetching…', 'loading');
  const info = await window.pulse.priceAt(state.sell.symbol, sellTimestamp()).catch(() => null);
  if (!info || info.error || !isFinite(info.price)) {
    setSellPriceTag('type it in', 'manual');
    return updateSellPreview();
  }
  $('sPrice').value = Number(info.price.toFixed(info.price < 10 ? 6 : 2));
  setSellPriceTag(state.sellWhen === 'now' ? 'live price' : info.exact ? 'price at that time' : 'nearest trading time', 'auto');
  updateSellPreview();
}

/** In "by amount" mode the field holds money, so units come from the sale price. */
function sellQty() {
  const row = state.sell;
  if (!row) return NaN;
  if (state.sellMode === 'all') return row.qty;
  const raw = parseFloat($('sQty').value);
  const price = parseFloat($('sPrice').value);
  if (!isFinite(raw) || raw <= 0) return NaN;
  if (state.sellMode === 'amount') return isFinite(price) && price > 0 ? raw / price : NaN;
  return raw;
}

function updateSellPreview() {
  const el = $('sellPreview');
  const row = state.sell;
  if (!row) return;
  const qty = sellQty();
  const price = parseFloat($('sPrice').value);
  const fees = parseFloat($('sFees').value) || 0;

  if (!isFinite(price)) return (el.innerHTML = '<span class="muted">Type the price you sold at.</span>');
  if (!isFinite(qty) || qty <= 0) {
    return (el.innerHTML = `<span class="muted">${
      state.sellMode === 'amount' ? 'Enter the money you got back.' : 'Enter how many you sold.'
    }</span>`);
  }
  if (qty - row.qty > 1e-9) {
    return (el.innerHTML = `<span class="warn">You only hold <b>${num(row.qty, row.qty % 1 ? 4 : 0)}</b> — cannot sell ${num(qty, 4)}.</span>`);
  }

  const proceeds = qty * price - fees;
  const cost = qty * row.avgPrice;
  const pnl = proceeds - cost;
  const pct = cost ? (pnl / cost) * 100 : 0;
  const left = row.qty - qty;
  // Prices typed here are in the currency the share trades in, not the portfolio's base.
  const cur = row.currency || state.base;
  const inBase = cur !== state.base && row.fxRate
    ? ` <span class="muted">(${money(pnl * row.fxRate, state.base)} in ${esc(state.base)})</span>`
    : '';

  el.innerHTML = `Selling <b>${num(qty, qty % 1 ? 4 : 0)}</b> of <b>${esc(shortSym(row.symbol))}</b>
    at <b>${money(price, cur)}</b> = <b>${money(proceeds, cur)}</b>${fees ? ` <span class="muted">(after ${money(fees, cur)} charges)</span>` : ''}
    <br/>Cost was <b>${money(cost, cur)}</b> → <b class="${cls(pnl)}">${pnl >= 0 ? 'profit' : 'loss'} ${money(Math.abs(pnl), cur)}</b>
    <span class="${cls(pnl)}">(${pctS(pct, 1)})</span>${inBase}
    <br/><span class="muted">${left <= 1e-9 ? 'This closes the position completely.' : `${num(left, left % 1 ? 4 : 0)} left after this sale.`}</span>`;
}

function openAdd(prefillSymbol) {
  $('modalAdd').hidden = false;
  resetPick();
  $('fQty').value = '';
  state.whenMode = 'now';
  setQtyMode('qty');
  document.querySelectorAll('#whenToggle button').forEach((b) => b.classList.toggle('active', b.dataset.when === 'now'));
  $('whenPickWrap').hidden = true;
  updatePreview();
  if (prefillSymbol) {
    $('fSymbol').value = prefillSymbol;
    runSearch(prefillSymbol);
  } else {
    $('fSymbol').focus();
  }
}

let searchTimer;
function runSearch(q) {
  clearTimeout(searchTimer);
  if (!q || q.trim().length < 1) {
    state.sugRows = [];
    renderSuggestions();
    return;
  }
  searchTimer = setTimeout(async () => {
    const rows = await window.pulse.search(q.trim());
    state.sugRows = rows || [];
    state.sugIndex = rows && rows.length ? 0 : -1;
    renderSuggestions();
  }, 220);
}

/* ---------------- charts ---------------- */

/**
 * Two charts run at once: the full stock modal and the small one folded into the buy dialog.
 * They share this engine, so anything added here (axes, crosshair, ranges) appears in both.
 */
const CHART_TARGETS = {
  main: { svg: 'chSvg', tip: 'chTip', box: 'chBox', price: 'chPrice' },
  buy: { svg: 'bcSvg', tip: 'bcTip', box: 'bcBox', price: 'bcPrice' }
};

/** Read live from the stylesheet so chart ink follows the active theme. */
const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

async function openChart(symbol, name) {
  if (!symbol) return;
  state.chartSym = symbol;
  $('modalChart').hidden = false;
  $('chSym').textContent = shortSym(symbol);
  $('chSub').textContent = name || '';
  $('chSvg').innerHTML = '';
  document.querySelectorAll('#chRange button').forEach((b) => b.classList.toggle('active', b.dataset.r === '1D'));
  $('chNews').innerHTML = newsListHtml(relatedNews({ symbol, name }));
  await loadChart('main', symbol, '1D');
}

async function loadChart(key, symbol, range) {
  const t = CHART_TARGETS[key];
  if (!symbol) return;
  $(t.price).textContent = 'loading…';
  const info = await window.pulse.history(symbol, range).catch(() => null);
  if (!info || info.error || !info.points || !info.points.length) {
    $(t.price).innerHTML = '<span class="muted">No chart data for this range.</span>';
    $(t.svg).innerHTML = '';
    state.charts[key] = null;
    return;
  }
  const pts = info.points;
  const cur = SYMBOLS[info.currency] || '';
  const last = pts[pts.length - 1].c;
  const first = pts[0].c;
  const chg = first ? ((last - first) / first) * 100 : 0;
  $(t.price).innerHTML = `<b>${cur}${num(last, last > 1000 ? 0 : 2)}</b> <span class="${cls(chg)}">${pctS(chg, 2)}</span> <span class="muted">(${esc(range)})</span>`;
  state.charts[key] = { pts, cur, range, symbol, up: chg >= 0 };
  drawChart(key);
}

/** Grid steps rounded to 1/2/5 × 10ⁿ so axis labels read as round numbers. */
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

/**
 * Axis wording follows the span the data actually covers, not the range button that was
 * pressed — if a provider returns daily candles for a "1D" request, clock times would all
 * read the same and the axis would be useless.
 */
function timeLabel(ts, spanMs) {
  const d = new Date(ts);
  const day = 864e5;
  if (spanMs <= 2 * day) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (spanMs <= 10 * day) return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' });
  if (spanMs <= 400 * day) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

const CH = { w: 700, h: 260, padR: 54, padB: 24, padT: 10 };

/** The rounded price band, computed once so the drawing and the crosshair share one y scale. */
function chartBand(pts) {
  const closes = pts.map((p) => p.c);
  let lo = Math.min(...closes);
  let hi = Math.max(...closes);
  // A flat series would collapse to a zero-height band, so give it breathing room.
  if (hi - lo < 1e-9) {
    hi += Math.abs(hi) * 0.005 || 1;
    lo -= Math.abs(lo) * 0.005 || 1;
  }
  const step = niceStep(hi - lo, 4);
  const gLo = Math.floor(lo / step) * step;
  const gHi = Math.ceil(hi / step) * step;
  return { step, gLo, gHi, rng: gHi - gLo || 1 };
}

function drawChart(key) {
  const c = state.charts[key];
  if (!c) return;
  const { w, h, padR, padB, padT } = CH;
  const plotW = w - padR;
  const plotH = h - padB - padT;
  const { step, gLo, gHi, rng } = chartBand(c.pts);

  const x = (i) => (i * plotW) / (c.pts.length - 1 || 1);
  const y = (v) => padT + plotH - ((v - gLo) / rng) * plotH;

  const d = c.pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(' ');
  const color = cssVar(c.up ? '--up' : '--down', c.up ? '#17e29a' : '#ff4d6d');
  const last = c.pts[c.pts.length - 1];

  // Money axis, drawn down the right so the price sits beside the latest point.
  let grid = '';
  for (let v = gLo; v <= gHi + 1e-9; v += step) {
    const yy = y(v);
    grid += `<line class="ch-grid" x1="0" y1="${yy.toFixed(1)}" x2="${plotW}" y2="${yy.toFixed(1)}"/>
      <text class="ch-axis y" x="${plotW + 6}" y="${(yy + 3.5).toFixed(1)}">${esc(c.cur)}${num(v, v >= 1000 ? 0 : 2)}</text>`;
  }

  // Time axis, spaced so labels never collide regardless of how many points came back.
  const spanMs = last.t - c.pts[0].t;
  const ticks = Math.min(6, c.pts.length);
  let xAxis = '';
  for (let t = 0; t < ticks; t++) {
    const i = Math.round((t * (c.pts.length - 1)) / Math.max(1, ticks - 1));
    const xx = x(i);
    const anchor = t === 0 ? 'start' : t === ticks - 1 ? 'end' : 'middle';
    xAxis += `<line class="ch-grid" x1="${xx.toFixed(1)}" y1="${padT}" x2="${xx.toFixed(1)}" y2="${padT + plotH}"/>
      <text class="ch-axis x" style="text-anchor:${anchor}" x="${xx.toFixed(1)}" y="${h - 7}">${esc(timeLabel(c.pts[i].t, spanMs))}</text>`;
  }

  const gid = `chg-${key}`;
  $(CHART_TARGETS[key].svg).innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}${xAxis}
    <path class="ch-area" d="${d} L${x(c.pts.length - 1).toFixed(1)},${padT + plotH} L0,${padT + plotH} Z" fill="url(#${gid})"/>
    <path class="ch-line" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle class="ch-dot" cx="${x(c.pts.length - 1).toFixed(1)}" cy="${y(last.c).toFixed(1)}" r="3.5" fill="${color}"/>
    <g class="ch-cross-g" style="display:none">
      <line class="ch-cross" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}"/>
      <circle class="ch-cross-dot" r="4" fill="${color}" stroke="var(--bg-1)" stroke-width="2"/>
    </g>`;
}

/** Pointer position → nearest candle, reported as money and moment in one card. */
function chartHover(key, e) {
  const c = state.charts[key];
  const t = CHART_TARGETS[key];
  const svg = $(t.svg);
  const cross = svg && svg.querySelector('.ch-cross-g');
  if (!c || !cross) return;

  const r = svg.getBoundingClientRect();
  const { w, h, padR, padB, padT } = CH;
  const plotW = w - padR;
  const plotH = h - padB - padT;
  // The SVG letterboxes inside its box, so map client pixels back through the viewBox.
  const scale = Math.min(r.width / w, r.height / h);
  const offX = (r.width - w * scale) / 2;
  const offY = (r.height - h * scale) / 2;
  const vx = (e.clientX - r.left - offX) / scale;
  if (vx < 0 || vx > plotW) return chartHoverOut(key);

  const i = Math.max(0, Math.min(c.pts.length - 1, Math.round((vx / plotW) * (c.pts.length - 1))));
  const p = c.pts[i];
  const { gLo, rng } = chartBand(c.pts);
  const px = (i * plotW) / (c.pts.length - 1 || 1);
  const py = padT + plotH - ((p.c - gLo) / rng) * plotH;

  cross.style.display = '';
  const line = cross.querySelector('.ch-cross');
  const dot = cross.querySelector('.ch-cross-dot');
  line.setAttribute('x1', px);
  line.setAttribute('x2', px);
  dot.setAttribute('cx', px);
  dot.setAttribute('cy', py);

  const first = c.pts[0].c;
  const move = first ? ((p.c - first) / first) * 100 : 0;
  const spanMs = c.pts[c.pts.length - 1].t - c.pts[0].t;
  const when = new Date(p.t).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: '2-digit',
    ...(spanMs <= 10 * 864e5 ? { hour: '2-digit', minute: '2-digit' } : {})
  });
  const tip = $(t.tip);
  tip.hidden = false;
  tip.innerHTML = `<b>${esc(c.cur)}${num(p.c, p.c >= 1000 ? 0 : 2)}</b><span>${esc(when)}</span>
    <span class="${cls(move)}"> · ${pctS(move, 2)}</span>`;

  const boxR = $(t.box).getBoundingClientRect();
  const left = offX + px * scale + (r.left - boxR.left);
  tip.style.left = `${Math.max(52, Math.min(boxR.width - 52, left))}px`;
  tip.style.top = `${offY + py * scale + (r.top - boxR.top) - 10}px`;
}

function chartHoverOut(key) {
  const t = CHART_TARGETS[key];
  const svg = $(t.svg);
  const cross = svg && svg.querySelector('.ch-cross-g');
  if (cross) cross.style.display = 'none';
  $(t.tip).hidden = true;
}

/* ---------------- pdf statement ---------------- */

const stmtMoney = (v, cur) =>
  v == null || !isFinite(v)
    ? '—'
    : `${v < 0 ? '-' : ''}${SYMBOLS[cur] || `${cur} `}${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * A self-contained document handed to Chromium's own PDF printer.
 *
 * It carries ink-on-paper styling on purpose: a statement gets printed and filed, so it must
 * not inherit whatever theme the app happens to be wearing, and it must survive being opened
 * with no stylesheet, no fonts and no scripts available.
 */
function buildStatementHtml() {
  const pf = state.data.portfolio || { totals: {}, rows: [], trades: [] };
  const t = pf.totals || {};
  const cur = t.baseCurrency || state.base;
  const rows = pf.rows || [];
  const trades = pf.trades || [];
  const m = (v) => stmtMoney(v, cur);
  const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  const summary = [
    ['Net worth', m(t.netWorth), `${t.positions || 0} open position${t.positions === 1 ? '' : 's'}`],
    ['Total put in', m(t.totalCost), 'held plus already sold'],
    ['Market value', m(t.value), t.cash ? `plus ${m(t.cash)} cash` : 'open positions only'],
    ['Money made', m(t.totalPnl), pctS(t.totalPnlPct)],
    ['On paper', m(t.unrealised), `${pctS(t.unrealisedPct)} · still held`],
    ['Banked', m(t.realised), `${t.tradeCount || 0} sale${t.tradeCount === 1 ? '' : 's'} · ${t.winRate != null ? Math.round(t.winRate) : 0}% won`]
  ];

  const holdingRows = rows.length
    ? rows
        .map(
          (r) => `<tr>
        <td class="mono">${esc(shortSym(r.symbol))}</td>
        <td>${esc(r.name || '')}</td>
        <td class="n">${num(r.qty, r.qty % 1 ? 4 : 0)}</td>
        <td class="n">${stmtMoney(r.avgPrice, r.currency || cur)}</td>
        <td class="n">${stmtMoney(r.price, r.currency || cur)}</td>
        <td class="n">${m(r.invested)}</td>
        <td class="n">${m(r.value)}</td>
        <td class="n ${sign(r.pnl)}">${m(r.pnl)}</td>
        <td class="n ${sign(r.pnl)}">${pctS(r.pnlPct, 1)}</td>
        <td class="n">${num(r.weight, 1)}%</td>
        <td>${esc(stmtDate(r.buyTs || (r.buyDate ? Date.parse(r.buyDate) : null)))}</td>
        <td class="n">${r.heldDays != null ? `${r.heldDays}d` : '—'}</td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="12" class="empty">No open holdings.</td></tr>';

  const tradeRows = trades.length
    ? trades
        .map(
          (x) => `<tr>
        <td>${esc(stmtDate(x.ts))}</td>
        <td class="mono">${esc(shortSym(x.symbol))}</td>
        <td>${esc(x.name || '')}</td>
        <td class="n">${num(x.qty, x.qty % 1 ? 4 : 0)}</td>
        <td class="n">${stmtMoney(x.buyPrice, x.currency || cur)}</td>
        <td class="n">${stmtMoney(x.sellPrice, x.currency || cur)}</td>
        <td class="n">${x.fees ? stmtMoney(x.fees, x.currency || cur) : '—'}</td>
        <td class="n">${m(x.cost)}</td>
        <td class="n">${m(x.proceeds)}</td>
        <td class="n ${sign(x.pnl)}">${m(x.pnl)}</td>
        <td class="n ${sign(x.pnl)}">${pctS(x.pnlPct, 1)}</td>
      </tr>`
        )
        .join('')
    : '<tr><td colspan="11" class="empty">Nothing has been sold yet.</td></tr>';

  const generated = new Date().toLocaleString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>PulseDesk portfolio statement</title>
<style>
  @page { size: A4; }
  /* Paper is white wherever this opens: a viewer in dark mode must not repaint it. */
  :root { color-scheme: light; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: #12162a; background: #fff; margin: 0; padding: 14px; font-size: 10px; }
  h1 { font-size: 20px; letter-spacing: 3px; margin: 0; }
  h1 b { color: #4b32d6; }
  h2 { font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; margin: 22px 0 7px; color: #4b32d6;
       border-bottom: 1.5px solid #4b32d6; padding-bottom: 4px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #12162a; padding-bottom: 9px; }
  .head .meta { text-align: right; font-size: 9.5px; color: #5a6180; line-height: 1.6; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
  .card { border: 1px solid #d3d8ea; border-radius: 7px; padding: 9px 11px; background: #f6f7fc; }
  .card .k { font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; color: #6b7395; display: block; }
  .card .v { font-size: 16px; font-weight: 700; display: block; margin: 2px 0 1px; }
  .card .s { font-size: 8.5px; color: #6b7395; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8px; letter-spacing: 0.9px; text-transform: uppercase; color: #5a6180;
       border-bottom: 1px solid #c8cee4; padding: 5px 5px; }
  td { padding: 5px; border-bottom: 1px solid #edeff7; font-size: 9.5px; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.mono { font-weight: 700; letter-spacing: 0.4px; }
  td.empty { text-align: center; color: #8b92ad; padding: 16px; }
  tr { page-break-inside: avoid; }
  .pos { color: #067a4e; font-weight: 700; }
  .neg { color: #c81e42; font-weight: 700; }
  tfoot td { border-top: 1.5px solid #12162a; border-bottom: none; font-weight: 700; font-size: 10px; }
  .foot { margin-top: 24px; border-top: 1px solid #d3d8ea; padding-top: 9px; font-size: 8.5px; color: #6b7395; line-height: 1.7; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>PULSE<b>DESK</b></h1>
      <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#5a6180;margin-top:3px">Portfolio statement</div>
    </div>
    <div class="meta">
      Generated ${esc(generated)}<br/>
      Reported in <b>${esc(cur)}</b><br/>
      ${rows.length} open holding${rows.length === 1 ? '' : 's'} · ${trades.length} closed trade${trades.length === 1 ? '' : 's'}
    </div>
  </div>

  <div class="cards">
    ${summary.map(([k, v, s]) => `<div class="card"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span class="s">${esc(s)}</span></div>`).join('')}
  </div>

  <h2>Open holdings</h2>
  <table>
    <thead><tr>
      <th>Ticker</th><th>Company</th><th class="n">Qty</th><th class="n">Avg buy</th><th class="n">Price now</th>
      <th class="n">Invested</th><th class="n">Value</th><th class="n">P&amp;L</th><th class="n">P&amp;L %</th>
      <th class="n">Weight</th><th>Bought</th><th class="n">Held</th>
    </tr></thead>
    <tbody>${holdingRows}</tbody>
    <tfoot><tr>
      <td colspan="5">Total</td>
      <td class="n">${m(t.invested)}</td><td class="n">${m(t.value)}</td>
      <td class="n ${sign(t.unrealised)}">${m(t.unrealised)}</td>
      <td class="n ${sign(t.unrealised)}">${pctS(t.unrealisedPct, 1)}</td>
      <td class="n">100%</td><td colspan="2"></td>
    </tr></tfoot>
  </table>

  <h2>Everything sold</h2>
  <table>
    <thead><tr>
      <th>Sold on</th><th>Ticker</th><th>Company</th><th class="n">Qty</th><th class="n">Buy</th><th class="n">Sell</th>
      <th class="n">Charges</th><th class="n">Cost</th><th class="n">Proceeds</th><th class="n">P&amp;L</th><th class="n">P&amp;L %</th>
    </tr></thead>
    <tbody>${tradeRows}</tbody>
    <tfoot><tr>
      <td colspan="7">Total</td>
      <td class="n">${m(t.realisedCost)}</td>
      <td class="n">${m((t.realisedCost || 0) + (t.realised || 0))}</td>
      <td class="n ${sign(t.realised)}">${m(t.realised)}</td>
      <td class="n ${sign(t.realised)}">${pctS(t.realisedPct, 1)}</td>
    </tr></tfoot>
  </table>

  <div class="foot">
    Prices are the last values PulseDesk fetched and may lag the exchange. Costs are weighted averages across every
    purchase of a ticker; a partial sale leaves the remaining units on their original cost. Amounts are converted to
    ${esc(cur)} at the exchange rate in force when this statement was produced.<br/>
    This document is a record of what you entered — it is not a broker contract note, not a tax document and not
    investment advice.<br/>
    <b>PulseDesk</b> · created by Dheerav Tandon · your holdings are stored only on your own device.
  </div>
</body></html>`;
}

async function saveStatement() {
  const btn = $('btnStatement');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Building…';
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await window.pulse.exportPdf(buildStatementHtml(), `PulseDesk-statement-${stamp}.pdf`);
    if (res && res.error) alert(`Could not build the statement: ${res.error}`);
  } catch (err) {
    alert(err.message || 'Could not build the statement.');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* ---------------- theme ---------------- */

function applyTheme(theme, persist) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  const btn = $('btnTheme');
  btn.textContent = state.theme === 'light' ? '◑' : '◐';
  btn.title = state.theme === 'light' ? 'Switch to dark' : 'Switch to light';
  // Chart ink is read from the stylesheet, so anything already drawn needs redrawing.
  Object.keys(state.charts).forEach((k) => state.charts[k] && drawChart(k));
  if (persist) window.pulse.settings.set({ theme: state.theme });
}

/* ---------------- events ---------------- */

function bind() {
  $('btnRefresh').addEventListener('click', async (e) => {
    e.currentTarget.classList.add('spin');
    await window.pulse.refresh();
    e.currentTarget.classList.remove('spin');
  });
  $('btnTheme').addEventListener('click', () => applyTheme(state.theme === 'light' ? 'dark' : 'light', true));
  $('btnMin').addEventListener('click', () => window.pulse.win.minimize());
  $('btnHide').addEventListener('click', () => window.pulse.win.hide());
  $('btnFull').addEventListener('click', () => window.pulse.win.toggleMaximize());
  $('btnCompact').addEventListener('click', () => {
    document.body.classList.toggle('compact');
    window.pulse.settings.set({ compact: document.body.classList.contains('compact') });
  });

  document.querySelectorAll('.chip-btn[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn[data-filter]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.newsFilter = b.dataset.filter;
      renderNews(state.data.news);
    })
  );

  document.querySelectorAll('.chip-btn[data-crypto]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn[data-crypto]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.cryptoTab = b.dataset.crypto;
      renderCrypto(state.data.crypto);
    })
  );

  document.querySelectorAll('.chip-btn[data-pop]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn[data-pop]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.popFilter = b.dataset.pop;
      renderPopular(state.data.popular);
    })
  );

  $('popSector').addEventListener('change', (e) => {
    state.sectorFilter = e.target.value;
    renderPopular(state.data.popular);
  });
  $('fundFilter').addEventListener('change', (e) => {
    state.fundFilter = e.target.value;
    renderFunds(state.data.funds);
  });

  $('newsList').addEventListener('click', (e) => {
    const row = e.target.closest('.nw');
    if (row && row.dataset.link) window.pulse.openExternal(row.dataset.link);
  });

  $('hypeGrid').addEventListener('click', (e) => {
    const row = e.target.closest('.hype');
    if (row) openChart(row.dataset.sym, row.dataset.name);
  });
  $('btnHypeMore').addEventListener('click', () => {
    renderHypeAll();
    $('modalHypeAll').hidden = false;
  });
  $('btnCloseHypeAll').addEventListener('click', () => ($('modalHypeAll').hidden = true));
  $('hypeAllList').addEventListener('click', (e) => {
    const row = e.target.closest('.ha-row');
    if (row) {
      $('modalHypeAll').hidden = true;
      openChart(row.dataset.sym, row.dataset.name);
    }
  });

  $('popList').addEventListener('click', (e) => {
    const sym = e.target.dataset.add;
    if (sym) {
      openAdd(sym);
      return;
    }
    const row = e.target.closest('.pop');
    if (row) openChart(row.dataset.sym, row.dataset.name);
  });

  $('pickNews').addEventListener('click', (e) => {
    const row = e.target.closest('.pn-item');
    if (row && row.dataset.link) window.pulse.openExternal(row.dataset.link);
  });
  $('chNews').addEventListener('click', (e) => {
    const row = e.target.closest('.pn-item');
    if (row && row.dataset.link) window.pulse.openExternal(row.dataset.link);
  });

  $('curToggle').addEventListener('click', async (e) => {
    const cur = e.target.dataset.cur;
    if (!cur) return;
    const pf = await window.pulse.portfolio.setBase(cur);
    if (pf) renderPortfolio(pf);
  });
  $('baseCur').addEventListener('change', async (e) => {
    const pf = await window.pulse.portfolio.setBase(e.target.value);
    if (pf) renderPortfolio(pf);
  });

  $('btnStatement').addEventListener('click', saveStatement);

  // market clocks
  $('sessions').addEventListener('click', (e) => {
    const tile = e.target.closest('.ses');
    if (tile) openSession(Number(tile.dataset.ses));
  });
  $('btnCloseSession').addEventListener('click', () => ($('modalSession').hidden = true));
  $('btnCloseSession2').addEventListener('click', () => ($('modalSession').hidden = true));

  // add holding
  $('btnAdd').addEventListener('click', () => openAdd());
  $('btnCancelAdd').addEventListener('click', () => ($('modalAdd').hidden = true));

  $('btnBuyChart').addEventListener('click', () => toggleBuyChart());
  $('bcRange').addEventListener('click', (e) => {
    const r = e.target.dataset.r;
    if (!r || !state.pick) return;
    document.querySelectorAll('#bcRange button').forEach((b) => b.classList.toggle('active', b === e.target));
    loadChart('buy', state.pick.symbol, r);
  });
  $('bcBox').addEventListener('pointermove', (e) => chartHover('buy', e));
  $('bcBox').addEventListener('pointerleave', () => chartHoverOut('buy'));

  $('payCur').addEventListener('click', async (e) => {
    const pay = e.target.dataset.pay;
    if (!pay) return;
    state.payCur = pay;
    document.querySelectorAll('#payCur button').forEach((b) => b.classList.toggle('active', b.dataset.pay === pay));
    await refreshPayFx();
    updatePreview();
  });

  $('fSymbol').addEventListener('input', (e) => runSearch(e.target.value));
  $('fSymbol').addEventListener('keydown', (e) => {
    if (!state.sugRows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.sugIndex = (state.sugIndex + 1) % state.sugRows.length;
      renderSuggestions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.sugIndex = (state.sugIndex - 1 + state.sugRows.length) % state.sugRows.length;
      renderSuggestions();
    } else if (e.key === 'Enter' && state.sugIndex >= 0) {
      e.preventDefault();
      pickSymbol(state.sugRows[state.sugIndex]);
    }
  });
  $('suggest').addEventListener('click', (e) => {
    const row = e.target.closest('.sug');
    if (row) pickSymbol(state.sugRows[Number(row.dataset.i)]);
  });

  $('whenToggle').addEventListener('click', (e) => {
    const when = e.target.dataset.when;
    if (!when) return;
    document.querySelectorAll('#whenToggle button').forEach((b) => b.classList.toggle('active', b === e.target));
    state.whenMode = when;
    $('whenPickWrap').hidden = when === 'now';
    if (when === 'past' && !$('fWhen').value) {
      const d = new Date(Date.now() - 7 * 864e5);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      $('fWhen').value = d.toISOString().slice(0, 16);
    }
    state.priceManual = false;
    fetchBuyPrice();
  });
  $('fWhen').addEventListener('change', () => {
    state.priceManual = false;
    fetchBuyPrice();
  });

  $('fAvg').addEventListener('input', () => {
    state.priceManual = true;
    setPriceTag('your price', 'manual');
    updatePreview();
  });
  $('fQty').addEventListener('input', updatePreview);

  $('qtyMode').addEventListener('click', (e) => {
    const mode = e.target.dataset.mode;
    if (mode) {
      setQtyMode(mode);
      updatePreview();
    }
  });

  $('btnSaveAdd').addEventListener('click', async () => {
    const qty = effectiveQty();
    const avgPrice = parseFloat($('fAvg').value);
    if (!state.pick) {
      $('investPreview').innerHTML = '<span class="warn">Pick a company from the list first.</span>';
      return;
    }
    if (!isFinite(qty) || qty <= 0 || !isFinite(avgPrice) || avgPrice < 0) {
      $('investPreview').innerHTML = `<span class="warn">${state.qtyMode === 'amount' ? 'Amount and buy price are both needed.' : 'Quantity and buy price are both needed.'}</span>`;
      return;
    }
    const pf = await window.pulse.portfolio.add({
      symbol: state.pick.symbol,
      name: state.pick.name,
      qty,
      avgPrice,
      buyTs: buyTimestamp()
    });
    if (pf) renderPortfolio(pf);
    $('modalAdd').hidden = true;
  });

  $('holdings').addEventListener('click', async (e) => {
    const sellId = e.target.dataset.sell;
    if (sellId) return openSell(sellId);

    const id = e.target.dataset.del;
    if (id) {
      const pf = await window.pulse.portfolio.remove(id, null);
      if (pf) renderPortfolio(pf);
      return;
    }
    const row = e.target.closest('.hold');
    if (row) openChart(row.dataset.sym, row.dataset.name);
  });

  // Holdings vs. Sold
  $('pfTabs').addEventListener('click', (e) => {
    const tab = e.target.dataset.pf;
    if (!tab) return;
    document.querySelectorAll('#pfTabs button').forEach((b) => b.classList.toggle('active', b.dataset.pf === tab));
    $('holdings').hidden = tab !== 'holdings';
    $('closedList').hidden = tab !== 'closed';
  });

  // sell flow
  $('sellWhenToggle').addEventListener('click', (e) => {
    const w = e.target.dataset.when;
    if (!w) return;
    state.sellWhen = w;
    document.querySelectorAll('#sellWhenToggle button').forEach((b) => b.classList.toggle('active', b.dataset.when === w));
    $('sellWhenWrap').hidden = w !== 'past';
    state.sellPriceManual = false;
    fetchSellPrice();
  });
  $('sellQtyMode').addEventListener('click', (e) => {
    if (e.target.dataset.mode) setSellMode(e.target.dataset.mode);
  });
  $('sWhen').addEventListener('change', () => {
    state.sellPriceManual = false;
    fetchSellPrice();
  });
  $('sQty').addEventListener('input', updateSellPreview);
  $('sFees').addEventListener('input', updateSellPreview);
  $('sPrice').addEventListener('input', () => {
    // Typing over a fetched price means the user knows better — stop overwriting it.
    state.sellPriceManual = true;
    setSellPriceTag('your price', 'manual');
    updateSellPreview();
  });
  $('btnCancelSell').addEventListener('click', () => ($('modalSell').hidden = true));
  $('btnConfirmSell').addEventListener('click', async () => {
    const row = state.sell;
    if (!row) return;
    const qty = sellQty();
    const price = parseFloat($('sPrice').value);
    const fees = parseFloat($('sFees').value) || 0;
    if (!isFinite(price) || price < 0) return alert('Enter the price you sold at.');
    if (!isFinite(qty) || qty <= 0) return alert('Enter how many you sold.');
    if (qty - row.qty > 1e-9) return alert(`You only hold ${num(row.qty, 4)} of ${shortSym(row.symbol)}.`);
    try {
      const pf = await window.pulse.portfolio.sell(row.id, { qty, price, fees, ts: sellTimestamp(), currency: row.currency });
      if (pf) renderPortfolio(pf);
      $('modalSell').hidden = true;
    } catch (err) {
      alert(err.message || 'Could not record that sale.');
    }
  });

  // settings
  $('btnSettings').addEventListener('click', async () => {
    const s = (state.settings = await window.pulse.settings.get());
    const p = await window.pulse.portfolio.read();
    $('sTop').checked = !!s.alwaysOnTop;
    $('sAll').checked = !!s.showOnAllDesktops;
    $('sOpacity').value = s.opacity || 1;
    $('sMarket').value = s.hyperMarket || 'both';
    $('sCash').value = p.cash || 0;
    $('modalSet').hidden = false;
  });
  $('btnCloseSet').addEventListener('click', () => ($('modalSet').hidden = true));
  $('btnSaveSet').addEventListener('click', async () => {
    try {
      await window.pulse.settings.set({
        alwaysOnTop: $('sTop').checked,
        showOnAllDesktops: $('sAll').checked,
        opacity: parseFloat($('sOpacity').value),
        hyperMarket: $('sMarket').value
      });
      const pf = await window.pulse.portfolio.setCash(parseFloat($('sCash').value) || 0);
      if (pf) renderPortfolio(pf);
    } finally {
      $('modalSet').hidden = true;
    }
  });

  // stock detail chart
  $('chRange').addEventListener('click', (e) => {
    const r = e.target.dataset.r;
    if (!r) return;
    document.querySelectorAll('#chRange button').forEach((b) => b.classList.toggle('active', b === e.target));
    loadChart('main', state.chartSym, r);
  });
  $('btnCloseChart').addEventListener('click', () => ($('modalChart').hidden = true));
  $('btnCloseChart2').addEventListener('click', () => ($('modalChart').hidden = true));
  $('chBox').addEventListener('pointermove', (e) => chartHover('main', e));
  $('chBox').addEventListener('pointerleave', () => chartHoverOut('main'));
  $('btnAddFromChart').addEventListener('click', () => {
    const sym = state.chartSym;
    $('modalChart').hidden = true;
    if (sym) openAdd(sym);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('modalAdd').hidden = true;
      $('modalSet').hidden = true;
      $('modalChart').hidden = true;
      $('modalHypeAll').hidden = true;
      $('modalSell').hidden = true;
      $('modalSession').hidden = true;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      window.pulse.win.toggleFullscreen();
    }
  });

  [$('modalAdd'), $('modalSet'), $('modalChart'), $('modalHypeAll'), $('modalSell'), $('modalSession')].forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m) m.hidden = true;
    })
  );
}

function clock() {
  const tick = () => {
    $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (state.data.meta) renderStatus(state.data.meta);
    // Bell countdowns run off absolute timestamps, so they tick without waiting for a refresh.
    if (state.session && !$('modalSession').hidden) {
      const el = $('seNow').querySelector('.se-state span');
      if (el) el.textContent = sessionCountdown(state.session);
    }
  };
  tick();
  setInterval(tick, 1000);
}

(async function boot() {
  bind();
  clock();
  const s = await window.pulse.settings.get();
  state.settings = s;
  applyTheme(s.theme || 'dark', false);
  if (s.compact) document.body.classList.add('compact');
  window.pulse.onUpdate(render);
  const initial = await window.pulse.get();
  if (initial) render(initial);
})();
