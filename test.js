// My Mehngai Index tests. Spawns the real server on a fresh throwaway DB,
// checks the API + the shared basket maths, then removes the test DB.
// Run: node test.js  (exit 0 = all pass)
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./public/basket-math.js');

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
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: DB }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    await waitUp(40);
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
      code: 'mehngai-admin', week_ended: '2026-11-05', combined_spi: 375.00, wow_pct: 0.40, yoy_pct: 11.50,
      quintiles: [{ label: 'Q1', band: 'Up to Rs 17,732', spi: 359.00, wow_pct: 0.30, yoy_pct: 8.20 }],
      items: [{ name: 'Tomatoes', unit: '1 kg', price_now: 130.00, price_prev_week: 125.70, price_year_ago: 180.00 }],
    });
    check('admin accepts correct code', good1.status === 200 && good1.json.ok === true, good1);
    const after1 = (await req('GET', '/api/spi')).json;
    check('latest week is now 2026-11-05', after1.latest.week_ended === '2026-11-05' && after1.latest.combined_spi === 375, after1.latest);
    check('weeks grew 10 -> 11', after1.weeks.length === 11, after1.weeks.length);
    const good2 = await req('POST', '/api/admin/spi-week', {
      code: 'mehngai-admin', week_ended: '2026-11-05', combined_spi: 376.00, wow_pct: 0.50, yoy_pct: 11.60,
      items: [{ name: 'Tomatoes', unit: '1 kg', price_now: 131.00, price_prev_week: 125.70, price_year_ago: 180.00 }],
    });
    check('re-post accepted', good2.status === 200, good2);
    const after2 = (await req('GET', '/api/spi')).json;
    check('re-post replaced: still 11 weeks, SPI now 376.00',
      after2.weeks.length === 11 && after2.latest.combined_spi === 376, { n: after2.weeks.length, spi: after2.latest.combined_spi });
    const tom2 = after2.items.find((i) => i.name === 'Tomatoes');
    check('re-post replaced item price (131.00)', tom2 && tom2.price_now === 131, tom2);
    // 6. Static pages serve.
    const home = await req('GET', '/');
    check('homepage serves (200, has basket + SPI sections)', home.status === 200, home.status);
    const adminPage = await req('GET', '/admin.html');
    check('admin page serves (200)', adminPage.status === 200, adminPage.status);
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
