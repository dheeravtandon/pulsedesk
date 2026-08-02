'use strict';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TRADING_WEEK = [1, 2, 3, 4, 5];

const SESSIONS = [
  { name: 'NSE', code: 'IN', city: 'Mumbai', country: 'India', tz: 'Asia/Kolkata', open: [9, 15], close: [15, 30], days: TRADING_WEEK },
  { name: 'NYSE', code: 'US', city: 'New York', country: 'United States', tz: 'America/New_York', open: [9, 30], close: [16, 0], days: TRADING_WEEK },
  { name: 'LSE', code: 'UK', city: 'London', country: 'United Kingdom', tz: 'Europe/London', open: [8, 0], close: [16, 30], days: TRADING_WEEK },
  { name: 'TSE', code: 'JP', city: 'Tokyo', country: 'Japan', tz: 'Asia/Tokyo', open: [9, 0], close: [15, 0], days: TRADING_WEEK },
  { name: 'CRYPTO', code: '24/7', city: 'UTC', country: 'Everywhere at once', tz: 'UTC', open: [0, 0], close: [24, 0], days: [0, 1, 2, 3, 4, 5, 6] }
];

function partsIn(tz, date = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'shortOffset'
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    weekday: p.weekday,
    dayIndex: WEEK.indexOf(p.weekday),
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10),
    clock: `${p.hour}:${p.minute}`,
    offset: p.timeZoneName || ''
  };
}

const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Runs of consecutive trading days read as "Monday – Friday" rather than five names. */
function daysLabel(days) {
  if (days.length === 7) return 'Every day, all day';
  const full = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return consecutive && sorted.length > 2 ? `${full[sorted[0]]} – ${full[sorted[sorted.length - 1]]}` : sorted.map((d) => full[d]).join(', ');
}

function human(mins) {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Minutes until the next opening bell, skipping every day the exchange does not trade.
 * A Saturday afternoon must count through Sunday to Monday, not to "tomorrow".
 */
function untilNextOpen(dayIndex, minutes, openM, days) {
  let add = minutes < openM ? 0 : 1;
  while (!days.includes((dayIndex + add) % 7) && add < 14) add++;
  return add * 1440 + openM - minutes;
}

function sessions(now = new Date()) {
  const at = now.getTime();
  return SESSIONS.map((s) => {
    const { weekday, dayIndex, minutes, clock, offset } = partsIn(s.tz, now);
    const openM = s.open[0] * 60 + s.open[1];
    const closeM = s.close[0] * 60 + s.close[1];
    const always = s.days.length === 7;
    const tradingToday = s.days.includes(dayIndex);
    const isOpen = always || (tradingToday && minutes >= openM && minutes < closeM);

    const toOpen = always ? 0 : untilNextOpen(dayIndex, minutes, openM, s.days);
    const toClose = isOpen && !always ? closeM - minutes : 0;
    const mins = always ? 0 : isOpen ? toClose : toOpen;

    // Wall-clock instants derived from the exchange's own current offset, so the renderer can
    // show the same bell in the viewer's timezone without repeating the DST arithmetic.
    const nextOpenTs = always ? null : at + toOpen * 60000;
    const nextCloseTs = always ? null : isOpen ? at + toClose * 60000 : nextOpenTs + (closeM - openM) * 60000;

    return {
      name: s.name,
      code: s.code,
      city: s.city,
      country: s.country,
      tz: s.tz,
      tzOffset: offset,
      clock,
      weekday,
      isOpen,
      always,
      tradingToday,
      weekend: !tradingToday,
      openLabel: always ? '00:00' : hhmm(openM),
      closeLabel: always ? '24:00' : hhmm(closeM),
      hoursLabel: always ? 'Non-stop' : `${hhmm(openM)} – ${hhmm(closeM)}`,
      daysLabel: daysLabel(s.days),
      sessionMinutes: always ? 1440 : closeM - openM,
      nextOpenTs,
      nextCloseTs,
      inMinutes: mins,
      status: always ? 'Open 24×7' : isOpen ? 'Open now' : 'Closed',
      countdown: always ? '24×7' : isOpen ? `closes in ${human(mins)}` : `opens in ${human(mins)}`
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
