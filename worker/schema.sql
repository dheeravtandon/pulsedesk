-- PulseDesk anonymous usage counter.
-- No account, no email, no IP. `visitor` is a random string the browser generates for itself.
-- Apply with: npx wrangler d1 execute pulsedesk --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor  TEXT NOT NULL,       -- random client id, rotatable by clearing site data
  day      TEXT NOT NULL,       -- YYYY-MM-DD
  ts       INTEGER NOT NULL,    -- epoch ms
  kind     TEXT NOT NULL,       -- 'open' (app launched) or 'heartbeat' (still open)
  platform TEXT,                -- 'web', 'android', 'ios', 'desktop'
  country  TEXT                 -- two-letter code from Cloudflare, coarse by design
);

CREATE INDEX IF NOT EXISTS idx_events_day     ON events (day);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events (visitor);
