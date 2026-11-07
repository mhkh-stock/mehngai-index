// My Mehngai Index tests. Spawns the real server on a fresh throwaway DB,
// checks the API + the shared basket maths + the shared CSV parser, then
// removes the test DB.
// Run: node test.js  (exit 0 = all pass)
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./public/basket-math.js');
const C = require('./public/csv-parse.js');

// Dummy fixture code for the test server only — the real server has no
// default code; it refuses to start without ADMIN_CODE set in the env.
const TEST_CODE = 'test-admin-code';

const PORT = 3049;
const DB = path.join(__dirname, 'data', 'test.sqlite');
const BASE = 'http://127.0.0.1:' + PORT;
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
}
function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = require('node:http').request(BASE + p, {
      method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, raw }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function waitUp(tries) {
  return req('GET', '/api/spi').then(() => true).catch(() => {
    if (tries <= 0) throw new Error('server did not come up');
    return new Promise((r) => setTimeout(r, 300)).then(() => waitUp(tries - 1));
  });
}
async function main() {
  try { fs.unlinkSync(DB); } catch {}
  try { fs.unlinkSync(DB + '-wal'); } catch {}
  try { fs.unlinkSync(DB + '-shm'); } catch {}
  let child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: DB, ADMIN_CODE: TEST_CODE }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    await waitUp(40);
    // 0. Fail-closed: without ADMIN_CODE the server must refuse to start.
    const noCode = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: '3050', DB_FILE: DB + '.nocode', ADMIN_CODE: '' }, stdio: 'ignore',
    });
    const noCodeExit = await new Promise((r) => { noCode.on('exit', (c) => r(c)); setTimeout(() => { try { noCode.kill(); } catch {} r(null); }, 5000); });
    check('server refuses to start without ADMIN_CODE (fail-closed)', noCodeExit === 1, noCodeExit);
    // 0b. Admin CSV parser: comma inside the spending band must not garble the row.
    const q = C.parseAdminLines('Q1, Up to Rs 17,732, 357.92, -0.07, 8.07\nQ2, Rs 17,733 – 22,888, 360.81, -0.25, 9.92', ['label'], 'band', ['spi', 'wow_pct', 'yoy_pct']);
    check('csv: quintile band with comma parses (Q1 band/spi/wow/yoy)',
      q[0].label === 'Q1' && q[0].band === 'Up to Rs 17, 732' && q[0].spi === '357.92' && q[0].wow_pct === '-0.07' && q[0].yoy_pct === '8.07'
      && q[1].band === 'Rs 17, 733 – 22, 888' && q[1].spi === '360.81', q);
    const it = C.parseAdminLines('Tomatoes, 1 kg, 125.70, 93.17, 174.55\nWheat Flour Bag, 20 kg, 2951.46, 2976.12, 2188.42', ['name'], 'unit', ['price_now', 'price_prev_week', 'price_year_ago']);
    check('csv: item lines parse (name/unit/prices)',
      it[0].name === 'Tomatoes' && it[0].unit === '1 kg' && it[0].price_now === '125.70' && it[0].price_year_ago === '174.55'
      && it[1].name === 'Wheat Flour Bag' && it[1].unit === '20 kg', it);
    check('csv: blank lines skipped, blank field is null',
      C.parseAdminLines('\nQ3, Rs 22,889 – 29,517, , , \n', ['label'], 'band', ['spi', 'wow_pct', 'yoy_pct'])
        .length === 1
      && C.parseAdminLines('Q3, Rs 22,889 – 29,517, , , ', ['label'], 'band', ['spi', 'wow_pct', 'yoy_pct'])[0].spi === null);
    // 0c. Health endpoint.
    const health = await req('GET', '/health');
    check('GET /health ok with latest week', health.status === 200 && health.json.ok === true && health.json.latest_week_ended === '2026-10-29' && health.json.combined_spi === 373.51, health.json);
    // 1. Personal-inflation maths (shared module, also used by the browser).
    const one = M.basketTotals([{ qty: 1, old_price: 1000, new_price: 1150 }]);
    check('single item 1000 -> 1150 = +15.00% and +Rs 150', one.pct === 15 && one.diff === 150 && one.new_total === 1150, one);
    // EXAMPLE basket from the homepage (PBS prices, week 29-10 vs 22-10-2026).
    const ex = M.basketTotals([
      { qty: 4, old_price: 93.17, new_price: 125.70 },
      { qty: 1, old_price: 2976.12, new_price: 2951.46 },
      { qty: 2, old_price: 444.27, new_price: 431.15 },
      { qty: 10, old_price: 218.92, new_price: 219.98 },
      { qty: 5, old_price: 141.61, new_price: 141.12 },
    ]);
    check('EXAMPLE basket old total 7134.59', ex.old_total === 7134.59, ex.old_total);
    check('EXAMPLE basket new total 7221.96', ex.new_total === 7221.96, ex.new_total);
    check('EXAMPLE basket +87.37 / +1.22%', ex.diff === 87.37 && ex.pct === 1.22, ex);
    check('target flag: above / below / at',
      M.targetFlag({ new_price: 125.70, target_price: 100 }) === 'above'
      && M.targetFlag({ new_price: 90, target_price: 100 }) === 'below'
      && M.targetFlag({ new_price: 100, target_price: 100 }) === 'at'
      && M.targetFlag({ new_price: 100, target_price: null }) === null);
    // 2. SPI seed counts + latest week.
    const spi = (await req('GET', '/api/spi')).json;
    check('seed: 51 items', spi.items.length === 51, spi.items.length);
    check('seed: 10-week trend', spi.weeks.length === 10, spi.weeks.length);
    check('seed: 5 quintiles', spi.quintiles.length === 5, spi.quintiles.length);
    check('latest week 2026-10-29, SPI 373.51, WoW -0.35, YoY 11.32',
      spi.latest.week_ended === '2026-10-29' && spi.latest.combined_spi === 373.51
      && spi.latest.wow_pct === -0.35 && spi.latest.yoy_pct === 11.32, spi.latest);
    const tomato = spi.items.find((i) => i.name === 'Tomatoes');
    check('tomato prices 125.70 / 93.17 / 174.55, WoW +34.91',
      tomato && tomato.price_now === 125.7 && tomato.price_prev_week === 93.17
      && tomato.price_year_ago === 174.55 && tomato.wow_pct === 34.91, tomato);
    check('movers: tomato is top riser', spi.movers_up[0] && spi.movers_up[0].name === 'Tomatoes', spi.movers_up[0]);
    check('Q1 quintile band + changes', (() => {
      const q1 = spi.quintiles.find((q) => q.label === 'Q1');
      return q1 && q1.band === 'Up to Rs 17,732' && q1.wow_pct === -0.07 && q1.yoy_pct === 8.07;
    })());
    // 3. Cities.
    const cities = (await req('GET', '/api/cities')).json;
    check('17 SPI cities incl Peshawar + Karachi',
      cities.cities.length === 17 && cities.cities.includes('Peshawar') && cities.cities.includes('Karachi'), cities.cities);
    // 4. Admin rejects a wrong code.
    const bad = await req('POST', '/api/admin/spi-week', { code: 'wrong', week_ended: '2026-11-05', combined_spi: 375 });
    check('admin rejects wrong code (403)', bad.status === 403, bad.status);
    // 5. Admin adds a new week; re-post replaces, never duplicates.
    const good1 = await req('POST', '/api/admin/spi-week', {
      code: TEST_CODE, week_ended: '2026-11-05', combined_spi: 375.00, wow_pct: 0.40, yoy_pct: 11.50,
      quintiles: [{ label: 'Q1', band: 'Up to Rs 17,732', spi: 359.00, wow_pct: 0.30, yoy_pct: 8.20 }],
      items: [{ name: 'Tomatoes', unit: '1 kg', price_now: 130.00, price_prev_week: 125.70, price_year_ago: 180.00 }],
    });
    check('admin accepts correct code', good1.status === 200 && good1.json.ok === true, good1);
    const after1 = (await req('GET', '/api/spi')).json;
    check('latest week is now 2026-11-05', after1.latest.week_ended === '2026-11-05' && after1.latest.combined_spi === 375, after1.latest);
    check('weeks grew 10 -> 11', after1.weeks.length === 11, after1.weeks.length);
    const good2 = await req('POST', '/api/admin/spi-week', {
      code: TEST_CODE, week_ended: '2026-11-05', combined_spi: 376.00, wow_pct: 0.50, yoy_pct: 11.60,
      items: [{ name: 'Tomatoes', unit: '1 kg', price_now: 131.00, price_prev_week: 125.70, price_year_ago: 180.00 }],
    });
    check('re-post accepted', good2.status === 200, good2);
    const after2 = (await req('GET', '/api/spi')).json;
    check('re-post replaced: still 11 weeks, SPI now 376.00',
      after2.weeks.length === 11 && after2.latest.combined_spi === 376, { n: after2.weeks.length, spi: after2.latest.combined_spi });
    const tom2 = after2.items.find((i) => i.name === 'Tomatoes');
    check('re-post replaced item price (131.00)', tom2 && tom2.price_now === 131, tom2);
    // 5b. Blank changes stay NULL (unknown), never 0.00% — the admin form
    // sends explicit null for blank wow/yoy fields.
    const blank = await req('POST', '/api/admin/spi-week', {
      code: TEST_CODE, week_ended: '2026-11-12', combined_spi: 377.00, wow_pct: null,
      quintiles: [{ label: 'Q1', band: 'Up to Rs 17,732', spi: 360.00, wow_pct: null, yoy_pct: null }],
      items: [],
    });
    check('blank-change week accepted', blank.status === 200, blank);
    const after3 = (await req('GET', '/api/spi')).json;
    const blankWeek = after3.weeks.find((w) => w.week_ended === '2026-11-12');
    check('blank wow/yoy stored as null, not 0', blankWeek && blankWeek.wow_pct === null && blankWeek.yoy_pct === null, blankWeek);
    const blankQ1 = after3.quintiles.find((q) => q.label === 'Q1');
    check('blank quintile changes stored as null, not 0', blankQ1 && blankQ1.wow_pct === null && blankQ1.yoy_pct === null, blankQ1);
    // 6. Static pages serve.
    const home = await req('GET', '/');
    check('homepage serves (200, has basket + SPI sections)', home.status === 200, home.status);
    const adminPage = await req('GET', '/admin.html');
    check('admin page serves (200)', adminPage.status === 200, adminPage.status);
    const csvJs = await req('GET', '/csv-parse.js');
    check('shared csv parser serves (200)', csvJs.status === 200, csvJs.status);
    check('homepage has 10-week trend table + EXAMPLE note',
      typeof home.raw === 'string' && home.raw.includes('id="trendBody"') && home.raw.includes('id="exampleNote"'), 'missing trendBody/exampleNote');
    // 7. Seed repair: simulate the stale-DB drift (local DB shipped with 43
    // of 51 items) — delete 2 items, restart, the server must restore them.
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    {
      const { DatabaseSync } = require('node:sqlite');
      const fixDb = new DatabaseSync(DB);
      fixDb.prepare("DELETE FROM item_prices WHERE item_id IN (SELECT id FROM items WHERE name IN ('Match Box', 'Toilet Soap LIFEBUOY 115 gm'))").run();
      fixDb.prepare("DELETE FROM items WHERE name IN ('Match Box', 'Toilet Soap LIFEBUOY 115 gm')").run();
      fixDb.close();
    }
    child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, PORT: String(PORT), DB_FILE: DB, ADMIN_CODE: TEST_CODE }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    await waitUp(40);
    const repaired = (await req('GET', '/api/spi')).json;
    check('seed repair: 51 items again after restart', repaired.items.length === 51, repaired.items.length);
    // The API shows prices relative to the latest (test-posted) week, so
    // verify the restored seed-week prices straight from the DB.
    const { DatabaseSync } = require('node:sqlite');
    const checkDb = new DatabaseSync(DB, { readOnly: true });
    const mb = checkDb.prepare(`
      SELECT (SELECT price FROM item_prices WHERE item_id = i.id AND week_ended = '2026-10-29') now_p,
             (SELECT price FROM item_prices WHERE item_id = i.id AND week_ended = '2026-10-22') prev_p,
             (SELECT price FROM item_prices WHERE item_id = i.id AND week_ended = '2025-10-30') year_p
      FROM items i WHERE i.name = 'Match Box'`).get();
    checkDb.close();
    check('seed repair: restored item has its seed prices',
      mb && mb.now_p === 6.31 && mb.prev_p === 6.31 && mb.year_p === 6.24, mb);
  } catch (e) {
    failed++;
    console.log('FAIL harness error — ' + (e && e.message));
    console.log('server output so far:\n' + out);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
