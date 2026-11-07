# Deploy — My Mehngai Index

Deploy-ready. The app is a PBS SPI tracker plus a personal-basket calculator:
the server stores official weekly SPI data only. Personal baskets live ONLY
in the visitor's browser localStorage and are never sent to this server.

## What you need
- This repo on GitHub: https://github.com/mhkh-stock/mehngai-index
- A SnapDeploy account (sign in with "Continue with GitHub") and one free
  container slot (the free tier allows 4 containers and 5 deploys per
  12-hour window — check the dashboard before pushing, the budget is rolling).

## Steps (SnapDeploy)
1. SnapDeploy dashboard → **New Container** (or "Create app").
2. Connect the repo `mhkh-stock/mehngai-index` (branch `main`).
3. Runtime: **Node 24** (the app needs Node 24+ for `node:sqlite`; no
   `npm install` — there are zero dependencies). `package.json` declares
   `"engines": {"node": ">=24"}`.
4. Start command: `node server.js`
5. Port: **3032** (the server binds `0.0.0.0` and reads `PORT` from the
   environment if the platform sets one).
6. Environment variables:
   - `ADMIN_CODE` — **required, fail-closed**. The server refuses to start
     without it; there is no default. Set a private code in the container's
     environment only — never in a file, the repo, or chat.
   - `PORT` — optional, defaults to `3032`.
   - `DB_FILE` — optional. Default is `data/mehngai.sqlite` in the app
     directory. On SnapDeploy set it to `/tmp/mehngai.sqlite` (see below).
7. Deploy. SnapDeploy auto-deploys on every GitHub push after the first one.

## Writable directory (read-only app dir)
SnapDeploy's `/app` is read-only, so the app cannot create
`data/mehngai.sqlite` there. Two layers handle this:
- If `DB_FILE` is set (recommended: `/tmp/mehngai.sqlite`), it is used as-is.
- If it is not set and the app directory is not writable, the server
  automatically falls back to `/tmp/mehngai/mehngai.sqlite` and logs
  `Data directory (read-only app dir fallback): /tmp/mehngai`.
  The DB is re-seeded from `seed-data.json` on first start, so nothing is
  lost — but note `/tmp` does not survive a container rebuild, so the
  admin-posted weeks would need re-posting after a rebuild. Keep a copy of
  any admin-posted week payloads if they matter.

## After deploy — check it works
- Open the site URL. The home page (personal basket + SPI tracker) must load.
- `GET /health` must return `{"ok":true,"latest_week_ended":"2026-10-29","combined_spi":373.51}`.
- `GET /api/spi` must return 51 items, a 10-week trend and 5 quintiles.
- `GET /api/cities` must return 17 SPI cities, including Peshawar and Karachi.
- If the first open shows SnapDeploy's "Waking up your container..." page,
  wait a moment and reload — free containers sleep after ~15 minutes idle.

## Notes
- The SQLite file (`data/mehngai.sqlite`) is created on the container at
  first start and seeded from `seed-data.json` — do NOT upload a local
  database file; it is gitignored on purpose (`data/`, `*.sqlite*`).
- The app serves only files under `public/` plus `/health`, `/api/spi`,
  `/api/cities` and the admin POST `/api/admin/spi-week`. Nothing else is
  reachable (`/data/mehngai.sqlite`, `/seed-data.json`, `/README.md` all
  return 404).
- Seed data is verified PBS SPI rows only (week ended 29-10-2026). New weeks
  are posted by the admin with `ADMIN_CODE` via the admin page; re-posting
  the same week replaces it, never duplicates it.
- Run the tests before pushing: `ADMIN_CODE` is required to run the server,
  the suite uses a dummy test code on a throwaway DB —
  `node test.js` (must print all tests passed).
