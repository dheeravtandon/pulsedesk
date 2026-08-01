'use strict';

const $ = (id) => document.getElementById(id);
const state = { data: {}, newsFilter: 'ALL', settings: {}, base: 'INR' };

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
  return `$${p.toExponential(2)}`;
}

const ago = (ts) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

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
  chip.style.background = 'rgba(255,255,255,0.05)';
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
      const c = cls(r.changePct);
      const col = r.changePct >= 0 ? '#17e29a' : '#ff4d6d';
      const cur = SYMBOLS[r.currency] || '';
      return `<div class="hype" data-sym="${esc(r.symbol)}">
        <span class="rank">#${i + 1}</span>
        <div>
          <div class="sym">${esc(r.symbol.replace('.NS', '').replace('.BO', ''))}</div>
          <div class="nm">${esc(r.name || '')}</div>
        </div>
        <div class="px"><b>${cur}${num(r.price, r.price > 1000 ? 0 : 2)}</b><span class="${c}">${pctS(r.changePct, 1)}</span></div>
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
  $('pfSub').textContent = `${t.positions} position${t.positions === 1 ? '' : 's'} · ${t.winners}▲ ${t.losers}▼`;

  $('pfNet').textContent = money(t.netWorth);
  const d = $('pfDay');
  d.className = `d ${cls(t.dayPnl)}`;
  d.textContent = `${arrow(t.dayPnl)} ${money(t.dayPnl)} today (${pctS(t.dayPnlPct)})`;

  const hist = (pf.history || []).map((h) => h.value);
  $('pfSpark').innerHTML = hist.length > 1
    ? spark(hist, t.unrealised >= 0 ? '#17e29a' : '#ff4d6d', 48)
    : `<div class="empty" style="padding:6px;font-size:9.5px">Value history builds up as the app runs</div>`;

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
      .map((r, i) => `<div class="leg"><i style="background:${COLORS[i % COLORS.length]}"></i><span>${esc(r.symbol.replace('.NS', ''))}</span><b>${r.weight.toFixed(1)}%</b></div>`)
      .join('');
  } else {
    $('donut').innerHTML = '';
    $('allocLegend').innerHTML = '';
  }

  $('holdings').innerHTML = rows.length
    ? rows
        .map(
          (r) => `<div class="hold" data-id="${esc(r.id)}">
      <div class="h-l">
        <div class="h-s">${esc(r.symbol.replace('.NS', '').replace('.BO', ''))} <span class="${cls(r.changePct)}" style="font-size:9px">${pctS(r.changePct, 1)}</span></div>
        <div class="h-q">${num(r.qty, r.qty % 1 ? 4 : 0)} @ ${num(r.avgPrice)} → ${num(r.price)}${r.live ? '' : ' (stale)'}</div>
      </div>
      <div><div class="h-v">${money(r.value)}</div><div class="h-sub">inv ${money(r.invested)}</div></div>
      <div><div class="h-p ${cls(r.pnl)}">${money(r.pnl)}</div><div class="h-sub ${cls(r.pnl)}">${pctS(r.pnlPct, 1)}</div></div>
      <button class="x" data-del="${esc(r.id)}" title="Remove holding">×</button>
    </div>`
        )
        .join('')
    : '<div class="empty">No holdings yet.<br/>Hit <b>+ Add</b> to track your first position.</div>';
}

function renderCrypto(c) {
  if (!c) return;
  const rows = c.rows || [];
  const win = rows.length ? rows[0].window : '5h';
  $('cryptoMeta').textContent = rows.length ? `${rows[0].source} · ${win} window` : '—';
  $('cryptoList').innerHTML = rows.length
    ? rows
        .map(
          (r, i) => `<div class="cx" style="border-left-color:${r.change5h >= 0 ? 'var(--up)' : 'var(--down)'}">
      <span class="n">${i + 1}</span>
      <div style="min-width:0"><div class="s">${esc(r.symbol)}</div><div class="nm2">${esc(r.name)} · vol ${bigNum(r.volume5hUsd)}</div></div>
      <div class="p">${coinPrice(r.price)}</div>
      <div class="c ${cls(r.change5h)}">${pctS(r.change5h, 1)}<small>24h ${pctS(r.change24h, 1)}</small></div>
    </div>`
        )
        .join('')
    : '<div class="empty">Loading crypto momentum…</div>';

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
      <span class="st" style="background:${s.isOpen ? 'var(--up)' : 'var(--down)'};box-shadow:0 0 8px ${s.isOpen ? 'var(--up)' : 'var(--down)'}"></span>
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
    <span class="seg">
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
            ${(i.tickers || []).slice(0, 4).map((t) => `<span class="tk">${esc(t.replace('.NS', ''))}</span>`).join('')}
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
  if (patch.weather) renderWeather(d.weather);
  if (patch.market) {
    renderSessions(d.market);
    renderPulse(d.market);
  }
  if (patch.news) renderNews(d.news);
  if (patch.meta) renderStatus(d.meta);
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

  $('newsList').addEventListener('click', (e) => {
    const row = e.target.closest('.nw');
    if (row && row.dataset.link) window.pulse.openExternal(row.dataset.link);
  });

  // portfolio
  $('btnAdd').addEventListener('click', () => {
    $('modalAdd').hidden = false;
    $('fSymbol').focus();
  });
  $('btnCancelAdd').addEventListener('click', () => ($('modalAdd').hidden = true));
  $('btnSaveAdd').addEventListener('click', async () => {
    const symbol = $('fSymbol').value.trim();
    const qty = parseFloat($('fQty').value);
    const avgPrice = parseFloat($('fAvg').value);
    if (!symbol || !isFinite(qty) || qty <= 0 || !isFinite(avgPrice)) {
      $('lookup').textContent = '⚠ symbol, quantity and average price are required';
      return;
    }
    const pf = await window.pulse.portfolio.add({ symbol, qty, avgPrice });
    if (pf) renderPortfolio(pf);
    $('modalAdd').hidden = true;
    $('fSymbol').value = $('fQty').value = $('fAvg').value = '';
    $('lookup').textContent = '';
  });

  let lookupTimer;
  $('fSymbol').addEventListener('input', (e) => {
    clearTimeout(lookupTimer);
    const s = e.target.value.trim();
    if (s.length < 2) return ($('lookup').textContent = '');
    $('lookup').textContent = 'checking…';
    lookupTimer = setTimeout(async () => {
      const q = await window.pulse.lookup(s);
      $('lookup').textContent = q && !q.error ? `✓ ${q.name} · ${q.currency} ${num(q.price)} (${pctS(q.changePct, 1)})` : '✗ symbol not found';
      if (q && !q.error && !$('fAvg').value) $('fAvg').placeholder = num(q.price);
    }, 550);
  });

  $('holdings').addEventListener('click', async (e) => {
    const id = e.target.dataset.del;
    if (!id) return;
    const pf = await window.pulse.portfolio.remove(id, null);
    if (pf) renderPortfolio(pf);
  });

  $('baseCur').addEventListener('change', async (e) => {
    const pf = await window.pulse.portfolio.setBase(e.target.value);
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
    await window.pulse.settings.set({
      alwaysOnTop: $('sTop').checked,
      showOnAllDesktops: $('sAll').checked,
      opacity: parseFloat($('sOpacity').value),
      hyperMarket: $('sMarket').value,
      weather: { lat: isFinite(lat) ? lat : null, lon: isFinite(lon) ? lon : null }
    });
    const pf = await window.pulse.portfolio.setCash(parseFloat($('sCash').value) || 0);
    if (pf) renderPortfolio(pf);
    $('modalSet').hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('modalAdd').hidden = true;
      $('modalSet').hidden = true;
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
