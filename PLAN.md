# My Mehngai Index — PLAN

Project 3 of the 5-project series. Stack: Node 24+, native node:http +
node:sqlite, zero dependencies, CommonJS, port 3032, DB_FILE env support,
ADMIN_CODE env (default `mehngai-admin`).

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

## v2 ideas (not built, only when asked)

- Chart of the combined SPI trend (canvas, like the Mandi trend chart).
- Per-city basket comparison using PBS city-wise annex prices (needs the
  annex PDF transcribed per city — 17 cities × 51 items, a large manual
  entry; only do it if the city comparison is really wanted).
- Reminder note when a new Friday release is due (admin-side, not user SMS).
- Export a basket as a shareable text summary (still no server storage).
