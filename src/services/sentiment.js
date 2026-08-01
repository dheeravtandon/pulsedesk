'use strict';

/**
 * Lexicon scorer tuned for market headlines. Weights are hand-set by how strongly the
 * phrase historically co-occurs with a directional move, not by general-purpose polarity.
 */
const BULLISH = {
  'record high': 3, 'all-time high': 3, 'all time high': 3, 'beats estimates': 3, 'beat estimates': 3,
  'tops estimates': 3, 'raises guidance': 3, 'raised guidance': 3, 'upgrade': 2.5, 'upgraded': 2.5,
  'buyback': 2.5, 'surge': 2.5, 'surges': 2.5, 'soar': 2.5, 'soars': 2.5, 'rally': 2.2, 'rallies': 2.2,
  'jumps': 2.2, 'jump': 2, 'spike': 2, 'breakout': 2, 'outperform': 2, 'bullish': 2, 'strong buy': 2.5,
  'profit rises': 2.2, 'profit jumps': 2.4, 'revenue beat': 2.4, 'dividend hike': 2, 'stake buy': 1.6,
  'wins order': 2, 'bags order': 2.2, 'new contract': 1.8, 'approval': 1.8, 'approved': 1.6,
  'partnership': 1.4, 'expansion': 1.3, 'launches': 1.1, 'gains': 1.5, 'gain': 1.2, 'rises': 1.5,
  'rise': 1.2, 'climbs': 1.5, 'higher': 1.1, 'optimism': 1.4, 'rebound': 1.6, 'recovery': 1.4,
  'inflows': 1.4, 'target raised': 2.6, 'price target hike': 2.6, 'stock split': 1.5, 'ipo pop': 2,
  'boom': 1.8, 'momentum': 1.3, 'undervalued': 1.5, 'accumulate': 1.4, 'stimulus': 1.5, 'rate cut': 1.8
};

const BEARISH = {
  'record low': -3, '52-week low': -2.6, 'misses estimates': -3, 'miss estimates': -3, 'profit warning': -3,
  'cuts guidance': -3, 'cut guidance': -3, 'downgrade': -2.5, 'downgraded': -2.5, 'plunge': -3, 'plunges': -3,
  'crash': -3, 'crashes': -3, 'tumble': -2.5, 'tumbles': -2.5, 'slump': -2.4, 'slumps': -2.4,
  'sinks': -2.4, 'sink': -2.2, 'slide': -2, 'slides': -2, 'drop': -1.8, 'drops': -1.8, 'falls': -1.8,
  'fall': -1.6, 'declines': -1.6, 'decline': -1.4, 'lower': -1.1, 'bearish': -2, 'sell-off': -2.4,
  'selloff': -2.4, 'correction': -1.8, 'recession': -2.2, 'layoff': -1.8, 'layoffs': -1.8, 'fraud': -3,
  'probe': -2, 'investigation': -2, 'lawsuit': -1.8, 'fine': -1.5, 'penalty': -1.6, 'default': -2.6,
  'bankruptcy': -3, 'insolvency': -2.8, 'downtrend': -1.8, 'loss widens': -2.6, 'net loss': -2.2,
  'revenue miss': -2.4, 'target cut': -2.6, 'price target cut': -2.6, 'resignation': -1.5, 'resigns': -1.4,
  'outflows': -1.4, 'tariff': -1.6, 'ban': -1.8, 'halt': -1.6, 'recall': -1.8, 'rate hike': -1.6,
  'inflation surge': -1.8, 'stake sale': -1.2, 'block deal': -1.0, 'downgrades': -2.5, 'warning': -1.6
};

const NEGATORS = ['no ', 'not ', 'never ', "n't", 'despite ', 'fails to ', 'unlikely '];
const HEDGES = ['may ', 'might ', 'could ', 'expected to ', 'likely ', 'forecast', 'outlook', 'analysts say'];

function analyze(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  let score = 0;
  const hits = [];

  for (const [phrase, w] of Object.entries({ ...BULLISH, ...BEARISH })) {
    let idx = t.indexOf(phrase);
    while (idx !== -1) {
      const window = t.slice(Math.max(0, idx - 22), idx);
      const negated = NEGATORS.some((n) => window.includes(n));
      score += negated ? -w * 0.6 : w;
      hits.push(phrase);
      idx = t.indexOf(phrase, idx + phrase.length);
    }
  }

  const hedged = HEDGES.some((h) => t.includes(h));
  if (hedged) score *= 0.75;

  const pctMatch = t.match(/([+-]?\d{1,3}(?:\.\d+)?)\s?(?:%|per cent|percent)/);
  if (pctMatch) {
    const mag = Math.min(Math.abs(parseFloat(pctMatch[1])) / 10, 2);
    score += score >= 0 ? mag : -mag;
  }

  const direction = score > 0.8 ? 'RISE' : score < -0.8 ? 'FALL' : 'FLAT';
  const confidence = Math.max(8, Math.min(96, Math.round(Math.abs(score) * 17 + (hits.length ? 22 : 6))));

  return { score: Math.round(score * 100) / 100, direction, confidence, hits: [...new Set(hits)].slice(0, 4), hedged };
}

module.exports = { analyze };
