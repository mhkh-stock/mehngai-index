// My Mehngai Index — your personal household inflation, from Pakistan's
// official weekly SPI prices (PBS). Two halves, kept separate on purpose:
//  * the PBS tracker below is SERVER data (official national averages);
//  * personal baskets live ONLY in the visitor's browser localStorage and are
//    never sent to this server, never stored in the SQLite DB.
// Node.js 24+, native node:http + node:sqlite only. No external dependencies.
// Port 3032. Data: data/mehngai.sqlite. Admin gate is a shared code from env
// ADMIN_CODE — REQUIRED, no default (fail-closed, same as the sibling
// projects): the server refuses to start without it, so the code is never
// a public value sitting in the repo. Set it in the environment on the
// machine that runs the server; never put it in a file or in chat.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3032);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'mehngai.sqlite');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_CODE = process.env.ADMIN_CODE;
if (!ADMIN_CODE) { console.error('FATAL: ADMIN_CODE env var is required — set a private code, there is no default.'); process.exit(1); }
const SOURCE = 'PBS SPI, week ended 29-10-2026';
// A number field that is missing, blank, null or non-numeric stores as NULL
// (unknown), never as 0 — 0 would falsely read as "0.00% change".
function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS weeks (
  week_ended TEXT PRIMARY KEY, combined_spi REAL NOT NULL,
  wow_pct REAL, yoy_pct REAL
);
CREATE TABLE IF NOT EXISTS quintiles (
  week_ended TEXT NOT NULL, label TEXT NOT NULL, band TEXT NOT NULL,
  spi REAL, wow_pct REAL, yoy_pct REAL, PRIMARY KEY (week_ended, label)
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS item_prices (
  item_id INTEGER NOT NULL REFERENCES items(id), week_ended TEXT NOT NULL,
  price REAL NOT NULL, PRIMARY KEY (item_id, week_ended)
);
`);

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function itemId(name, unit) {
  db.prepare('INSERT OR IGNORE INTO items(name, unit) VALUES(?,?)').run(name, unit || '');
  const row = db.prepare('SELECT id FROM items WHERE name = ?').get(name);
  if (unit && row) db.prepare('UPDATE items SET unit = ? WHERE id = ? AND (unit IS NULL OR unit = ?)').run(unit, row.id, '');
  return row.id;
}
// ---- seed: verified PBS rows only (see seed-data.json + README sources) ----
const weekCount = db.prepare('SELECT COUNT(*) c FROM weeks').get().c;
if (weekCount === 0) {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
  const upWeek = db.prepare('INSERT OR REPLACE INTO weeks(week_ended, combined_spi, wow_pct, yoy_pct) VALUES(?,?,?,?)');
  for (const w of seed.weeks) upWeek.run(w.week_ended, w.combined_spi, w.wow_pct, w.yoy_pct);
  const upQ = db.prepare('INSERT OR REPLACE INTO quintiles(week_ended, label, band, spi, wow_pct, yoy_pct) VALUES(?,?,?,?,?,?)');
  for (const q of seed.quintiles_2026_10_29) upQ.run('2026-10-29', q.label, q.band, q.spi, q.wow_pct, q.yoy_pct);
  const upPrice = db.prepare('INSERT OR REPLACE INTO item_prices(item_id, week_ended, price) VALUES(?,?,?)');
  for (const it of seed.items) {
    const id = itemId(it.name, it.unit);
    upPrice.run(id, '2026-10-29', it.now);
    upPrice.run(id, '2026-10-22', it.prev);
    upPrice.run(id, '2025-10-30', it.year);
  }
}

// ---- seed repair: a DB created from an older, shorter seed file keeps
// serving fewer items than the seed promises (the local DB shipped with 43
// of 51 — the last 8 seed items were never inserted, and the seed block
// above only runs on a brand-new DB). On every start, add any seed item
// that is missing entirely, with its three seed-week prices. Only MISSING
// items are touched: an item already present keeps whatever prices it has,
// so an admin correction to a seed-week price is never overwritten.
{
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
  const have = db.prepare('SELECT id FROM items WHERE name = ?');
  const upPrice = db.prepare('INSERT OR REPLACE INTO item_prices(item_id, week_ended, price) VALUES(?,?,?)');
  for (const it of seed.items) {
    if (have.get(it.name)) continue;
    const id = itemId(it.name, it.unit);
    upPrice.run(id, '2026-10-29', it.now);
    upPrice.run(id, '2026-10-22', it.prev);
    upPrice.run(id, '2025-10-30', it.year);
  }
}

function latestWeek() {
  return db.prepare('SELECT week_ended, combined_spi, wow_pct, yoy_pct FROM weeks ORDER BY week_ended DESC LIMIT 1').get() || null;
}
function weeks() {
  return db.prepare('SELECT week_ended, combined_spi, wow_pct, yoy_pct FROM weeks ORDER BY week_ended ASC').all();
}
function quintilesFor(weekEnded) {
  return db.prepare('SELECT label, band, spi, wow_pct, yoy_pct FROM quintiles WHERE week_ended = ? ORDER BY label').all(weekEnded);
}
function itemsFor(weekEnded) {
  const prev = addDays(weekEnded, -7);
  const year = addDays(weekEnded, -364);
  const rows = db.prepare(`
    SELECT i.name name, i.unit unit,
      (SELECT price FROM item_prices WHERE item_id = i.id AND week_ended = ?) price_now,
      (SELECT price FROM item_prices WHERE item_id = i.id AND week_ended = ?) price_prev_week,
      (SELECT price FROM item_prices WHERE item_id = i.id AND week_ended = ?) price_year_ago
    FROM items i ORDER BY i.name`).all(weekEnded, prev, year);
  return rows.map((r) => ({
    ...r,
    wow_pct: r.price_now != null && r.price_prev_week != null && r.price_prev_week !== 0
      ? Math.round(((r.price_now - r.price_prev_week) / r.price_prev_week) * 10000) / 100 : null,
    yoy_pct: r.price_now != null && r.price_year_ago != null && r.price_year_ago !== 0
      ? Math.round(((r.price_now - r.price_year_ago) / r.price_year_ago) * 10000) / 100 : null,
  }));
}
function spiPayload() {
  const latest = latestWeek();
  if (!latest) return { latest: null, weeks: [], quintiles: [], items: [], movers_up: [], movers_down: [], source: SOURCE };
  const items = itemsFor(latest.week_ended);
  const withWow = items.filter((i) => i.wow_pct !== null);
  const movers_up = [...withWow].sort((a, b) => b.wow_pct - a.wow_pct).slice(0, 5);
  const movers_down = [...withWow].sort((a, b) => a.wow_pct - b.wow_pct).slice(0, 5);
  return {
    latest, weeks: weeks(), quintiles: quintilesFor(latest.week_ended),
    items, movers_up, movers_down, source: SOURCE,
    prev_week_ended: addDays(latest.week_ended, -7), year_ago_ended: addDays(latest.week_ended, -364),
  };
}
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
function cities() { return SEED.cities; }

// ---- HTTP layer (same shape as the sibling projects) ----
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 500000) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/spi' && req.method === 'GET') return sendJson(res, 200, spiPayload());
    if (p === '/api/cities' && req.method === 'GET') return sendJson(res, 200, { cities: cities() });
    if (p === '/health' && req.method === 'GET') {
      const l = latestWeek();
      return sendJson(res, 200, { ok: true, latest_week_ended: l ? l.week_ended : null, combined_spi: l ? l.combined_spi : null });
    }
    if (p === '/api/admin/spi-week' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.code !== ADMIN_CODE) return sendJson(res, 403, { error: 'bad admin code' });
      if (!body.week_ended || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.week_ended))) {
        return sendJson(res, 400, { error: 'week_ended (YYYY-MM-DD) required' });
      }
      const spi = Number(body.combined_spi);
      if (!Number.isFinite(spi)) return sendJson(res, 400, { error: 'combined_spi must be a number' });
      const week = String(body.week_ended);
      const prev = addDays(week, -7);
      const year = addDays(week, -364);
      // INSERT OR REPLACE = re-posting the same week replaces it, never duplicates.
      db.prepare('INSERT OR REPLACE INTO weeks(week_ended, combined_spi, wow_pct, yoy_pct) VALUES(?,?,?,?)')
        .run(week, spi, numOrNull(body.wow_pct), numOrNull(body.yoy_pct));
      if (Array.isArray(body.quintiles)) {
        const upQ = db.prepare('INSERT OR REPLACE INTO quintiles(week_ended, label, band, spi, wow_pct, yoy_pct) VALUES(?,?,?,?,?,?)');
        for (const q of body.quintiles) {
          if (q && q.label) upQ.run(week, String(q.label), String(q.band || ''), numOrNull(q.spi), numOrNull(q.wow_pct), numOrNull(q.yoy_pct));
        }
      }
      let itemCount = 0;
      if (Array.isArray(body.items)) {
        const upPrice = db.prepare('INSERT OR REPLACE INTO item_prices(item_id, week_ended, price) VALUES(?,?,?)');
        for (const it of body.items) {
          if (!it || !it.name) continue;
          const id = itemId(String(it.name), String(it.unit || ''));
          if (it.price_now !== undefined && Number.isFinite(Number(it.price_now))) upPrice.run(id, week, Number(it.price_now));
          if (it.price_prev_week !== undefined && Number.isFinite(Number(it.price_prev_week))) upPrice.run(id, prev, Number(it.price_prev_week));
          if (it.price_year_ago !== undefined && Number.isFinite(Number(it.price_year_ago))) upPrice.run(id, year, Number(it.price_year_ago));
          itemCount++;
        }
      }
      return sendJson(res, 200, { ok: true, week_ended: week, items: itemCount });
    }
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end('Method not allowed');
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`My Mehngai Index running on http://127.0.0.1:${PORT} (DB: ${DB_FILE})`);
});
