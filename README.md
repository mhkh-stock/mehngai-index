# My Mehngai Index — Aapki Apni Mehngai

**Your personal inflation rate, from your own household basket — plus Pakistan's
official weekly SPI prices.**

Government ka number sab ka average hai. Yeh tool aapka apna number nikalta
hai: aap jo khareedte hain, usi ke daam se.

## What it does

1. **My basket (the core tool, first on the homepage).** Pick items from
   Pakistan's official 51-item SPI list, enter how much you buy in a month and
   TWO prices per item — what you paid before, what you pay now. The app shows
   per-item change, old vs new monthly totals, the rupee difference per month,
   and your **spending-weighted personal inflation %** (totals first, then one
   percentage — a plain average of per-item percentages would over-weight
   cheap items). A one-tap **EXAMPLE** basket (labelled EXAMPLE on the page
   while it is loaded) is built from real PBS prices. Adding an item that is
   already in the basket updates its row instead of double-counting it. You
   can save several baskets (name + city + saved date) and compare any
   two side by side.
2. **PBS SPI tracker (official data).** Latest combined SPI, week-on-week and
   year-on-year change, the 5 household spending-group (quintile) rows, the
   biggest weekly movers, the full 51-item price table with three dates, and
   a **10-week combined-SPI trend table** (newest week first) so you can see
   whether mehngai is speeding up or cooling down.
3. **Item alerts (in-app only).** Set a target price on any basket item; when
   you update its current price, the basket flags it clearly: "above your
   target" / "below your target" / "at your target". No SMS, no WhatsApp.
4. **Admin weekly update.** One form posts a new SPI week (see below).

## Your personal rate vs the official SPI — read this

Your personal rate is **your** basket with **your** quantities and **your**
prices. The official SPI averages 51 items with government weights across 50
markets in 17 cities. The two numbers answer different questions: if your
basket is mostly tomatoes, your rate jumps when tomatoes jump (+34.91% in the
latest week); the official index moved only −0.35% that week because 24 items
were unchanged and chicken, eggs, flour and LPG fell. Neither number is wrong.

## Worked example (the test's numbers, and the homepage EXAMPLE basket)

- Simple: one item costing Rs 1,000 before and Rs 1,150 now →
  **+Rs 150, +15.00%**.
- EXAMPLE basket (real PBS prices, week ended 29-10-2026 vs 22-10-2026):
  tomatoes 4 kg (93.17 → 125.70), wheat flour 1 × 20 kg bag (2,976.12 →
  2,951.46), chicken 2 kg (444.27 → 431.15), milk 10 litres (218.92 → 219.98),
  sugar 5 kg (141.61 → 141.12). Old monthly total **Rs 7,134.59**, new total
  **Rs 7,221.96**, difference **+Rs 87.37**, personal inflation **+1.22%** —
  while the official SPI fell 0.35% that week. The tomato row also trips its
  Rs 100 target flag ("above your target").

## Data sources (all verified, with dates)

- Pakistan Bureau of Statistics (PBS), weekly Sensitive Price Indicator
  executive summary PDFs: week ended **29-10-2026** (latest seeded week:
  combined SPI **373.51**, WoW **−0.35%**, YoY **+11.32%**) and week ended
  **22-10-2026** (374.84, +0.65%, +11.85%). 10-week combined trend seeded
  from 27-08-2026 (361.07) to 29-10-2026 (373.51).
- The 51 item prices are **national averages** (29-10-2026 / 22-10-2026 /
  30-10-2025) from the same PDFs: 15 items rose, 12 fell, 24 were unchanged
  in the latest week. Quintile index values for 29-10-2026 (Q1 357.92, Q2
  360.81, Q3 381.91, Q4 369.30, Q5 373.45) come from the same executive
  summary; quintile week/year changes match the research notes.
- Seed file: `seed-data.json` (the only prices the app ships).

## API

- `GET /api/spi` — latest week, 10-week trend, quintiles, all 51 items with
  computed week/year %, top-5 risers and fallers, source label.
- `GET /api/cities` — the 17 SPI cities.
- `GET /health` — `{ ok: true, latest_week_ended, combined_spi }`.
- `POST /api/admin/spi-week` — `{code, week_ended, combined_spi, wow_pct,
  yoy_pct, quintiles: [{label, band, spi, wow_pct, yoy_pct}], items:
  [{name, unit, price_now, price_prev_week, price_year_ago}]}`. The code must
  equal `ADMIN_CODE` (env var, **required — there is no default**; the
  server refuses to start without it, so the code is never a public value
  in the repo). Re-posting the same week **replaces** it (INSERT OR
  REPLACE); it never duplicates a week. Previous-week prices land 7 days
  before the week, year-ago prices 364 days before, matching the PBS
  week-ended dates. Blank change fields store as unknown (null), never as
  0.00%. Posting fewer than 51 items is allowed but the admin page warns:
  the missing items show a blank "now" price until a full week is posted.

## Admin update routine (every Friday)

PBS publishes the SPI every Friday for the week ending Thursday, as a PDF on
pbs.gov.pk. Open the official executive summary, read the combined SPI and
the item prices, and enter them on `/admin.html` (index fields + quintiles +
one CSV line per item: `name, unit, now, prev, year`). That is the whole
routine — there is no feed to configure.

## Run it

```sh
ADMIN_CODE=<your-private-code> node server.js   # port 3032, DB data/mehngai.sqlite
# No default code: the server exits with FATAL if ADMIN_CODE is not set.
# Keep the code in the environment only — never in a file, repo, or chat.
DB_FILE=/tmp/mi.sqlite ADMIN_CODE=<your-private-code> node server.js   # custom DB path (SnapDeploy pattern)
node test.js              # 34 tests, fresh throwaway DB, removed afterwards
```

## Honest limits (also in the site footer)

- The personal rate is the user's own basket, **not** the official SPI.
- PBS publishes **PDFs only — no official API** — so weekly updates here are
  manual admin entries from each Friday release, not automatic.
- Prices shown are **national averages**, not any one city's price.
- **No SMS/WhatsApp alerts** — target flags are in-app only.
- **Privacy:** baskets live only in the visitor's browser (localStorage).
  They are never sent to the server and never stored in the SQLite DB.
- The admin code is a shared demo-grade code; set a private `ADMIN_CODE`
  before real public use.
