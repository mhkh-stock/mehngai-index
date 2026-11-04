// Admin page for My Mehngai Index: posts one SPI week to the server.
// The admin code is sent only as the API's code check; it is not stored here.
(function () {
  'use strict';
  function parseCsv(text, cols) {
    return text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var parts = l.split(',').map(function (p) { return p.trim(); });
      var obj = {};
      cols.forEach(function (c, i) { obj[c] = parts[i] === undefined || parts[i] === '' ? null : parts[i]; });
      return obj;
    });
  }
  document.getElementById('submitBtn').onclick = async function () {
    var result = document.getElementById('result');
    result.textContent = 'Saving…';
    var quintiles = parseCsv(document.getElementById('quintiles').value, ['label', 'band', 'spi', 'wow_pct', 'yoy_pct'])
      .map(function (q) {
        return { label: q.label, band: q.band,
          spi: q.spi === null ? null : Number(q.spi),
          wow_pct: q.wow_pct === null ? null : Number(q.wow_pct),
          yoy_pct: q.yoy_pct === null ? null : Number(q.yoy_pct) };
      });
    var items = parseCsv(document.getElementById('items').value, ['name', 'unit', 'price_now', 'price_prev_week', 'price_year_ago'])
      .map(function (it) {
        return { name: it.name, unit: it.unit || '',
          price_now: it.price_now === null ? undefined : Number(it.price_now),
          price_prev_week: it.price_prev_week === null ? undefined : Number(it.price_prev_week),
          price_year_ago: it.price_year_ago === null ? undefined : Number(it.price_year_ago) };
      });
    var body = {
      code: document.getElementById('code').value,
      week_ended: document.getElementById('week').value,
      combined_spi: Number(document.getElementById('spi').value),
      wow_pct: document.getElementById('wow').value === '' ? null : Number(document.getElementById('wow').value),
      yoy_pct: document.getElementById('yoy').value === '' ? null : Number(document.getElementById('yoy').value),
      quintiles: quintiles, items: items,
    };
    try {
      var res = await fetch('/api/admin/spi-week', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      var data = await res.json();
      if (!res.ok) { result.textContent = 'Error: ' + (data.error || res.status); return; }
      result.textContent = 'Saved week ' + data.week_ended + ' (' + data.items + ' items). Re-posting this week later will replace it, not duplicate it.';
    } catch (e) {
      result.textContent = 'Error: ' + e.message;
    }
  };
})();
