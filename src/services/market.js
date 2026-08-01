'use strict';

const SESSIONS = [
  { name: 'NSE', tz: 'Asia/Kolkata', open: [9, 15], close: [15, 30], flag: '🇮🇳' },
  { name: 'NYSE', tz: 'America/New_York', open: [9, 30], close: [16, 0], flag: '🇺🇸' },
  { name: 'LSE', tz: 'Europe/London', open: [8, 0], close: [16, 30], flag: '🇬🇧' },
  { name: 'TSE', tz: 'Asia/Tokyo', open: [9, 0], close: [15, 0], flag: '🇯🇵' },
  { name: 'CRYPTO', tz: 'UTC', open: [0, 0], close: [24, 0], flag: '₿' }
];

function partsIn(tz, date = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10), clock: `${p.hour}:${p.minute}` };
}

function sessions(now = new Date()) {
  return SESSIONS.map((s) => {
    const { weekday, minutes, clock } = partsIn(s.tz, now);
    const weekend = weekday === 'Sat' || weekday === 'Sun';
    const openM = s.open[0] * 60 + s.open[1];
    const closeM = s.close[0] * 60 + s.close[1];
    const always = s.name === 'CRYPTO';
    const isOpen = always || (!weekend && minutes >= openM && minutes < closeM);
    const mins = always ? 0 : isOpen ? closeM - minutes : minutes < openM ? openM - minutes : 24 * 60 - minutes + openM;
    return {
      name: s.name,
      flag: s.flag,
      clock,
      isOpen,
      always,
      weekend,
      inMinutes: mins,
      countdown: always ? '24×7' : `${Math.floor(mins / 60)}h ${mins % 60}m ${isOpen ? 'to close' : 'to open'}`
    };
  });
}

function breadth(rows) {
  const clean = (rows || []).filter((r) => r && isFinite(r.changePct));
  const up = clean.filter((r) => r.changePct > 0).length;
  const down = clean.filter((r) => r.changePct < 0).length;
  const flat = clean.length - up - down;
  const avg = clean.length ? clean.reduce((a, r) => a + r.changePct, 0) / clean.length : 0;
  const ratio = down ? up / down : up;
  return {
    advancers: up,
    decliners: down,
    unchanged: flat,
    total: clean.length,
    avgChange: avg,
    ratio,
    tone: ratio >= 1.6 ? 'RISK-ON' : ratio <= 0.6 ? 'RISK-OFF' : 'MIXED'
  };
}

/** One-line read on the tape from breadth, VIX and news skew. */
function pulse({ breadth: b, vix, newsCounts, fng }) {
  let score = 0;
  if (b) score += (b.ratio - 1) * 20 + b.avgChange * 6;
  if (isFinite(vix)) score += vix < 14 ? 12 : vix < 20 ? 4 : vix < 28 ? -8 : -18;
  if (newsCounts) score += (newsCounts.bullish - newsCounts.bearish) * 3;
  if (fng && isFinite(fng.value)) score += (fng.value - 50) * 0.25;
  score = Math.max(-100, Math.min(100, Math.round(score)));
  const mood =
    score >= 45 ? 'GREEDY' : score >= 15 ? 'BULLISH' : score > -15 ? 'NEUTRAL' : score > -45 ? 'BEARISH' : 'FEARFUL';
  return { score, mood };
}

module.exports = { sessions, breadth, pulse };
