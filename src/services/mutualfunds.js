'use strict';

const { cachedJSON, pool, settled } = require('./http');

const MFAPI = 'https://api.mfapi.in/mf';

/**
 * Curated, well-known Direct-Growth schemes spanning the main fund categories.
 * Scheme codes are permanent AMFI identifiers, verified against the live /mf list —
 * several of these funds were renamed by SEBI/AMC over the years (e.g. "SBI Bluechip"
 * is now "SBI Large Cap", "Kotak Emerging Equity" is now "Kotak Midcap"), so the code
 * is pinned rather than re-resolved by name search every time.
 */
const CURATED = [
  { code: 122639, label: 'Parag Parikh Flexi Cap', category: 'Flexi Cap' },
  { code: 119598, label: 'SBI Large Cap', category: 'Large Cap' },
  { code: 120465, label: 'Axis Large Cap', category: 'Large Cap' },
  { code: 118825, label: 'Mirae Asset Large Cap', category: 'Large Cap' },
  { code: 120586, label: 'ICICI Pru Large Cap', category: 'Large Cap' },
  { code: 119018, label: 'HDFC Large Cap', category: 'Large Cap' },
  { code: 118989, label: 'HDFC Mid Cap', category: 'Mid Cap' },
  { code: 119775, label: 'Kotak Midcap', category: 'Mid Cap' },
  { code: 118778, label: 'Nippon India Small Cap', category: 'Small Cap' },
  { code: 120828, label: 'Quant Small Cap', category: 'Small Cap' },
  { code: 125354, label: 'Axis Small Cap', category: 'Small Cap' },
  { code: 120716, label: 'UTI Nifty 50 Index', category: 'Index' },
  { code: 118968, label: 'HDFC Balanced Advantage', category: 'Hybrid' },
  { code: 120692, label: 'ICICI Pru Corporate Bond', category: 'Debt' }
];

/** AMFI dates come as DD-MM-YYYY, newest first. */
function changeOver(data, stepsBack) {
  const now = data[0];
  const then = data[stepsBack] || data[data.length - 1];
  if (!now || !then) return null;
  const a = parseFloat(now.nav);
  const b = parseFloat(then.nav);
  if (!isFinite(a) || !isFinite(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

async function oneFund(entry) {
  const detail = await cachedJSON(`mf:nav:${entry.code}`, `${MFAPI}/${entry.code}`, 6 * 3600 * 1000, { timeout: 12000 });
  const data = detail && detail.data;
  if (!data || !data.length) return null;
  return {
    schemeCode: entry.code,
    name: entry.label,
    fullName: (detail.meta && detail.meta.scheme_name) || entry.label,
    fundHouse: detail.meta && detail.meta.fund_house,
    category: entry.category,
    nav: parseFloat(data[0].nav),
    navDate: data[0].date,
    dayChangePct: changeOver(data, 1),
    monthChangePct: changeOver(data, 21),
    yearChangePct: changeOver(data, 252)
  };
}

async function popular() {
  const rows = await pool(CURATED, 4, (e) => settled(oneFund(e)));
  return rows.filter(Boolean);
}

module.exports = { popular, CURATED };
