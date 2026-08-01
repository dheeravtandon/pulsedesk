'use strict';

const $ = (id) => document.getElementById(id);
const state = {
  data: {},
  newsFilter: 'ALL',
  cryptoTab: 'pumps',
  popFilter: 'ALL',
  settings: {},
  base: 'INR',
  pick: null,
  priceInfo: null,
  priceManual: false,
  whenMode: 'now',
  sugRows: [],
  sugIndex: -1
};

/* ---------------- helpers ---------------- */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', JPY: '¥' };

function money(v, cur = state.base, compact = false) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sym = SYMBOLS[cur] || `${cur} `;
  if (compact || abs >= 1e5) {
    if (cur === 'INR') {
      if (abs >= 1e7) return `${sym}${(v / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `${sym}${(v / 1e5).toFixed(2)} L`;
    }
    if (abs >= 1e9) return `${sym}${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sym}${(v / 1e6).toFixed(2)}M`;
  }
  return sym + v.toLocaleString('en-IN', { minimumFractionDigits: abs < 100 ? 2 : 0, maximumFractionDigits: 2 });
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
      const col = r.changePct >= 0 ? '#17e29a' : '#ff4d6d';
      const cur = SYMBOLS[r.currency] || '';
      return `<div class="hype" data-sym="${esc(r.symbol)}">
        <span class="rank">#${i + 1}</span>
        <div>
          <div class="sym">${esc(shortSym(r.symbol))}</div>
          <div class="nm">${esc(r.name || '')}</div>
        </div>
        <div class="px"><b>${cur}${num(r.price, r.price > 1000 ? 0 : 2)}</b><span class="${cls(r.changePct)}">${pctS(r.changePct, 1)}</span></div>
        ${spark(r.series, col)}
        <div class="meter"><i style="width:${Math.max(6, r.hype)}%"></i></div>
        <div class="why">🔥 ${r.hype} · ${esc(r.reason)}</div>
      </div>`;
    })
    .join('');
}

function renderPortfolio(pf) {
  if (!pf) return;
  const t = pf.totals;
  state.base = t.baseCurrency;
  $('baseCur').value = t.baseCurrency;
  document.querySelectorAll('#curToggle button').forEach((b) => b.classList.toggle('active', b.dataset.cur === t.baseCurrency));
  $('pfSub').textContent = `${t.positions} position${t.positions === 1 ? '' : 's'} · ${t.winners}▲ ${t.losers}▼`;
  $('holdCount').textContent = t.positions ? `· ${t.positions}` : '';

  $('pfNet').textContent = money(t.netWorth);
  const d = $('pfDay');
  d.className = `d ${cls(t.dayPnl)}`;
  d.textContent = `${arrow(t.dayPnl)} ${money(t.dayPnl)} today (${pctS(t.dayPnlPct)})`;

  const hist = (pf.history || []).map((h) => h.value);
  $('pfSpark').innerHTML = hist.length > 1
    ? spark(hist, t.unrealised >= 0 ? '#17e29a' : '#ff4d6d', 48)
    : '<div class="empty" style="padding:6px;font-size:9.5px">Value history builds as the app runs</div>';

  const stats = [
    ['Invested', money(t.invested), `${t.positions} holdings`],
    ['Current value', money(t.value), t.cash ? `+ ${money(t.cash)} cash` : 'market value'],
    ['Unrealised P&L', money(t.unrealised), pctS(t.unrealisedPct), cls(t.unrealised)],
    ['Total P&L', money(t.totalPnl), `realised ${money(t.realised)}`, cls(t.totalPnl)]
  ];
  $('pfStats').innerHTML = stats
    .map(([k, v, s, c]) => `<div class="stat"><span class="k">${esc(k)}</span><span class="v ${c || ''}">${esc(v)}</span><span class="s">${esc(s)}</span></div>`)
    .join('');

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
    $('donut').innerHTML = `<svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="${R}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="11"/>${arcs}</svg>
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
          return `<div class="hold" data-id="${esc(r.id)}">
      <div class="h-l">
        <div class="h-s">${esc(shortSym(r.symbol))} <span class="${cls(r.changePct)}" style="font-size:9px">${pctS(r.changePct, 1)}</span></div>
        <div class="h-q">${num(r.qty, r.qty % 1 ? 4 : 0)} @ ${num(r.avgPrice)} → ${num(r.price)}${r.live ? '' : ' (stale)'}</div>
        <div class="h-since">${esc(since)}</div>
      </div>
      <div><div class="h-v">${money(r.value)}</div><div class="h-sub">inv ${money(r.invested)}</div></div>
      <div><div class="h-p ${cls(r.pnl)}">${money(r.pnl)}</div><div class="h-sub ${cls(r.pnl)}">${pctS(r.pnlPct, 1)}</div></div>
      <button class="x" data-del="${esc(r.id)}" title="Remove holding">×</button>
    </div>`;
        })
        .join('')
    : '<div class="empty">No holdings yet.<br/>Hit <b>+ Add holding</b> and start typing a company name.</div>';
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
  const f = state.popFilter;
  const list = rows.filter((r) => (f === 'ALL' ? true : f === 'IN' ? /\.(NS|BO)$/.test(r.symbol) : !/\.(NS|BO)$/.test(r.symbol)));
  const band = (s) => (s === 'very steady' ? 'st-very' : s === 'steady' ? 'st-steady' : s === 'moves a lot' ? 'st-moves' : 'st-vol');

  el.innerHTML = list.length
    ? list
        .map((r) => {
          const cur = SYMBOLS[r.currency] || '';
          return `<div class="pop">
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

function renderWeather(w) {
  if (!w) return;
  $('wxCity').textContent = w.city || '';
  const cells = [
    ['Feels', `${num(w.feelsC, 0)}°`],
    ['Humidity', `${num(w.humidity, 0)}%`],
    ['Wind', `${num(w.windKph, 0)} km/h`],
    ['Rain', `${num(w.rainChance, 0)}%`],
    ['UV', num(w.uv, 1)],
    ['AQI', w.aqi != null ? num(w.aqi, 0) : '—'],
    ['Sunrise', (w.sunrise || '').slice(11, 16) || '—'],
    ['Sunset', (w.sunset || '').slice(11, 16) || '—']
  ];
  $('wx').innerHTML = `
    <div class="wx-top">
      <div class="wx-ico">${esc(w.icon)}</div>
      <div style="min-width:0">
        <div class="wx-t">${num(w.tempC, 1)}°C</div>
        <div class="wx-d">${esc(w.desc)} · H ${num(w.maxC, 0)}° / L ${num(w.minC, 0)}°</div>
        <div class="wx-f">${w.aqiBand ? `Air: ${esc(w.aqiBand)}` : ''}${w.pm25 != null ? ` · PM2.5 ${num(w.pm25, 0)}` : ''}</div>
      </div>
    </div>
    <div class="wx-grid">${cells.map(([k, v]) => `<div class="wx-cell"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
    <div class="wx-hours">${(w.hourly || [])
      .map((h) => `<div class="wx-hr">${esc((h.time || '').slice(11, 16))}<b>${num(h.temp, 0)}°</b>${h.icon}</div>`)
      .join('')}</div>`;
}

function renderSessions(m) {
  if (!m || !m.sessions) return;
  $('sessions').innerHTML = m.sessions
    .map(
      (s) => `<div class="ses">
      <span class="st" style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:${s.isOpen ? 'var(--up)' : 'var(--down)'};box-shadow:0 0 8px ${s.isOpen ? 'var(--up)' : 'var(--down)'}"></span>
      <span class="nm3">${esc(s.flag)} ${esc(s.name)}</span>
      <span style="color:var(--txt-mute)">${esc(s.clock)}</span>
      <span class="cd">${esc(s.countdown)}</span>
    </div>`
    )
    .join('');
}

function renderNews(n) {
  if (!n) return;
  const items = (n.items || []).filter((i) => state.newsFilter === 'ALL' || i.direction === state.newsFilter);
  const c = n.counts || {};
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
          return `<div class="nw ${k}" data-link="${esc(i.link)}">
        <div class="dir">
          <span class="a" style="color:${col}">${i.direction === 'RISE' ? '▲' : i.direction === 'FALL' ? '▼' : '■'}</span>
          <span class="cf">${i.confidence}%</span>
          <span class="cbar"><i style="width:${i.confidence}%;background:${col}"></i></span>
        </div>
        <div>
          <div class="h">${esc(i.title)}</div>
          <div class="m">
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
  $('errBar').textContent = errs.length ? `⚠ ${errs.slice(0, 2).join(' · ')}` : '';
}

function render(patch) {
  const d = (state.data = { ...state.data, ...patch });
  if (patch.indices) renderTape(d.indices);
  if (patch.hyped) renderHype(d.hyped);
  if (patch.portfolio) renderPortfolio(d.portfolio);
  if (patch.crypto) renderCrypto(d.crypto);
  if (patch.popular) renderPopular(d.popular);
  if (patch.weather) renderWeather(d.weather);
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
  await fetchBuyPrice();
}

function resetPick() {
  state.pick = null;
  state.priceInfo = null;
  state.priceManual = false;
  $('picked').hidden = true;
  $('picked').innerHTML = '';
  $('fAvg').value = '';
  $('fSymbol').value = '';
  $('fSymbol').focus();
  setPriceTag('auto', 'auto');
  updatePreview();
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
  updatePreview();
}

async function updatePreview() {
  const el = $('investPreview');
  const qty = parseFloat($('fQty').value);
  const price = parseFloat($('fAvg').value);
  if (!state.pick) {
    el.innerHTML = '<span class="muted">Pick a company above and the price fills in by itself.</span>';
    return;
  }
  if (!isFinite(qty) || qty <= 0 || !isFinite(price)) {
    el.innerHTML = `<span class="muted">Enter a quantity to see what this costs.</span>`;
    return;
  }

  const cur = (state.priceInfo && state.priceInfo.currency) || '';
  const sym = SYMBOLS[cur] || '';
  const invested = qty * price;
  const when = state.whenMode === 'now' ? 'right now' : state.priceInfo ? dateLabel(state.priceInfo.at) : 'that date';

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

  el.innerHTML = `Buying <b>${num(qty, qty % 1 ? 4 : 0)}</b> of <b>${esc(shortSym(state.pick.symbol))}</b>
    at <b>${sym}${num(price)}</b> (${esc(when)}) = <b>${sym}${num(invested)}</b> invested${line2}`;
}

function openAdd(prefillSymbol) {
  $('modalAdd').hidden = false;
  resetPick();
  $('fQty').value = '';
  state.whenMode = 'now';
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

/* ---------------- events ---------------- */

function bind() {
  $('btnRefresh').addEventListener('click', async (e) => {
    e.currentTarget.classList.add('spin');
    await window.pulse.refresh();
    e.currentTarget.classList.remove('spin');
  });
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

  $('newsList').addEventListener('click', (e) => {
    const row = e.target.closest('.nw');
    if (row && row.dataset.link) window.pulse.openExternal(row.dataset.link);
  });

  $('popList').addEventListener('click', (e) => {
    const sym = e.target.dataset.add;
    if (sym) openAdd(sym);
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

  // add holding
  $('btnAdd').addEventListener('click', () => openAdd());
  $('btnCancelAdd').addEventListener('click', () => ($('modalAdd').hidden = true));

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

  $('btnSaveAdd').addEventListener('click', async () => {
    const qty = parseFloat($('fQty').value);
    const avgPrice = parseFloat($('fAvg').value);
    if (!state.pick) {
      $('investPreview').innerHTML = '<span style="color:var(--down)">⚠ Pick a company from the list first.</span>';
      return;
    }
    if (!isFinite(qty) || qty <= 0 || !isFinite(avgPrice) || avgPrice < 0) {
      $('investPreview').innerHTML = '<span style="color:var(--down)">⚠ Quantity and buy price are both needed.</span>';
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
    const id = e.target.dataset.del;
    if (!id) return;
    const pf = await window.pulse.portfolio.remove(id, null);
    if (pf) renderPortfolio(pf);
  });

  // settings
  $('btnSettings').addEventListener('click', async () => {
    const s = (state.settings = await window.pulse.settings.get());
    const p = await window.pulse.portfolio.read();
    $('sTop').checked = !!s.alwaysOnTop;
    $('sAll').checked = !!s.showOnAllDesktops;
    $('sOpacity').value = s.opacity || 1;
    $('sMarket').value = s.hyperMarket || 'both';
    $('sLat').value = (s.weather && s.weather.lat) || '';
    $('sLon').value = (s.weather && s.weather.lon) || '';
    $('sCash').value = p.cash || 0;
    $('modalSet').hidden = false;
  });
  $('btnCloseSet').addEventListener('click', () => ($('modalSet').hidden = true));
  $('btnSaveSet').addEventListener('click', async () => {
    const lat = parseFloat($('sLat').value);
    const lon = parseFloat($('sLon').value);
    try {
      await window.pulse.settings.set({
        alwaysOnTop: $('sTop').checked,
        showOnAllDesktops: $('sAll').checked,
        opacity: parseFloat($('sOpacity').value),
        hyperMarket: $('sMarket').value,
        weather: { lat: isFinite(lat) ? lat : null, lon: isFinite(lon) ? lon : null }
      });
      const pf = await window.pulse.portfolio.setCash(parseFloat($('sCash').value) || 0);
      if (pf) renderPortfolio(pf);
    } finally {
      $('modalSet').hidden = true;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('modalAdd').hidden = true;
      $('modalSet').hidden = true;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      window.pulse.win.toggleFullscreen();
    }
  });

  [$('modalAdd'), $('modalSet')].forEach((m) =>
    m.addEventListener('click', (e) => {
      if (e.target === m) m.hidden = true;
    })
  );
}

function clock() {
  const tick = () => {
    $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (state.data.meta) renderStatus(state.data.meta);
  };
  tick();
  setInterval(tick, 1000);
}

(async function boot() {
  bind();
  clock();
  const s = await window.pulse.settings.get();
  state.settings = s;
  if (s.compact) document.body.classList.add('compact');
  window.pulse.onUpdate(render);
  const initial = await window.pulse.get();
  if (initial) render(initial);
})();
