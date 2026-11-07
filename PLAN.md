# My Mehngai Index — PLAN

Project 3 of the 5-project series. Stack: Node 24+, native node:http +
node:sqlite, zero dependencies, CommonJS, port 3032, DB_FILE env support,
ADMIN_CODE env — REQUIRED, no default (fail-closed since the 2026-11-07
review; the server exits if it is not set).

## v1.0 — built 2026-11-04, tests 22/22 PASS, live smoke test verified

- Personal basket (localStorage only, never sent to server): 51-item picker,
  qty/month, before/now prices, optional target price with above/below/at
  flags, spending-weighted personal % + rupee difference, EXAMPLE basket,
  multi-basket save (name + 17 SPI cities) + side-by-side compare.
- PBS SPI tracker: seeded 10-week trend (27-08-2026 → 29-10-2026), latest
  week 29-10-2026 (373.51, −0.35% WoW, +11.32% YoY), 5 quintiles, 51 items
  with 3 dates each, top-5 movers both ways. All numbers source-labelled.
- Admin: POST /api/admin/spi-week (code-gated, idempotent replace) +
  admin.html form (index fields, quintile lines, item CSV box).
- Shared maths in public/basket-math.js (UMD: browser + Node tests use the
  same code, so the tested formula is the shipped formula).
- Theme: warm household-budget (cream/terracotta/brown), Urdu + English,
  mobile-friendly. Distinct from Mandi green and Bijli dark navy.

## Verified numbers (do not change without a new PBS release)

- EXAMPLE basket: old Rs 7,134.59 → new Rs 7,221.96 = +Rs 87.37, +1.22%.
- Simple test case: 1,000 → 1,150 = +Rs 150, +15.00%.
- Tomato (latest week): 93.17 → 125.70 = +34.91% WoW; top riser.
- Biggest faller (latest week): Electricity Charges for Q1, −3.92% WoW.

## v1.1 — review 2026-11-07, tests 34/34 PASS (was 22/22)

Full review (local only, nothing pushed). Seed re-verified independently:
51 items, 17 cities, 10 weeks, 5 quintiles; 15 rose / 12 fell / 24
unchanged; tomato top riser +34.91%, electricity Q1 top faller −3.92%.

Defects fixed:
- Admin quintile CSV parsing was broken: the band "Up to Rs 17,732"
  contains a comma, so a plain split(',') garbled every quintile row
  (Q1 stored as band "Up to Rs 17", spi 732, wow 357.92). Fixed with a
  shared right-anchored parser (public/csv-parse.js, UMD, used by
  admin.js and the tests); numbers are taken from the right, the middle
  field keeps its commas.
- Blank change fields stored as 0.00% instead of unknown: Number(null)
  is 0, so a blank wow/yoy (sent as explicit null by the admin form)
  became a false "0% change". Fixed with a numOrNull helper on the
  week + quintile paths; non-numeric values also store as null.
- Admin code was the PUBLIC default: anyone who could reach the server
  could overwrite the official seed week and inject fake items into the
  public table (demonstrated live on a throwaway DB: seed SPI 373.51
  overwritten to 999.99, fake item added, table 51 → 52 items). Fixed
  fail-closed like the sibling projects: ADMIN_CODE env is required,
  server exits without it, no default anywhere. Tests use a dummy
  fixture code; no real code lives in any file.
- No /health endpoint (siblings have one) — added, returns latest week
  + combined SPI.
- EXAMPLE basket was not labelled on the page once loaded (README
  promised the label) — a visible EXAMPLE note now shows while it is
  loaded and clears on any edit.
- "At your target" flag had no CSS rule (plain unstyled text while
  above/below were bold coloured) — added .alert.at.

Market improvements (small, safe):
- 10-week combined-SPI trend table on the homepage (newest first) — the
  API already returned the trend but the page never showed it.
- PBS hint under the item picker now carries the three week-ended dates
  (was "now / last week / last year" with no dates).
- Adding an item already in the basket updates its row instead of
  creating a duplicate row that double-counts it.
- Saved baskets now record + show the saved date (helps month-to-month
  comparison).
- Admin page warns when fewer than 51 items are posted (the missing
  items would otherwise silently show a blank "now" price).
- Seed repair (found live, not just in code): the local DB shipped with
  only 43 of the 51 seed items — it was created from an older, shorter
  seed file and the seed block only runs on a brand-new DB, so the app
  was serving 43 items while the page promised 51. The server now
  upserts any missing seed item (+ its three seed-week prices) on every
  start; existing items are never touched, so admin corrections to a
  seed-week price are never overwritten. The local DB has been healed
  to 51 items / 153 price rows; weeks untouched (10, latest 29-10-2026).

- Chart of the combined SPI trend (canvas, like the Mandi trend chart).
- Per-city basket comparison using PBS city-wise annex prices (needs the
  annex PDF transcribed per city — 17 cities × 51 items, a large manual
  entry; only do it if the city comparison is really wanted).
- Reminder note when a new Friday release is due (admin-side, not user SMS).
- Export a basket as a shareable text summary (still no server storage).
