// My Mehngai Index frontend. Baskets live in localStorage ONLY — this file
// never POSTs basket data anywhere. Server is used only for PBS SPI data.
(function () {
  'use strict';
  var M = window.MehngaiMath;
  var basket = []; // current working basket rows
  var spiItems = [];
  var savedKey = 'mehngai-baskets-v1';

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return 'Rs ' + Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pctStr(p) {
    if (p === null || p === undefined) return '—';
    return (p > 0 ? '+' : '') + p.toFixed(2) + '%';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  function renderBasket() {
    var t = M.basketTotals(basket);
    var body = $('basketBody');
    if (!basket.length) {
      body.innerHTML = '<tr><td colspan="9">Your basket is empty. Add an item above, or load the EXAMPLE basket.</td></tr>';
    } else {
      body.innerHTML = t.rows.map(function (r, i) {
        var flag = M.targetFlag(r);
        var alertHtml = '—';
        if (flag === 'above') alertHtml = '<span class="alert above">⚠ above your target (' + fmt(r.target_price) + ')</span>';
        else if (flag === 'below') alertHtml = '<span class="alert below">✓ below your target (' + fmt(r.target_price) + ')</span>';
        else if (flag === 'at') alertHtml = '<span class="alert at">= at your target</span>';
        return '<tr><td>' + esc(r.name) + '<br><small>' + esc(r.unit) + '</small></td>'
          + '<td>' + esc(r.qty) + '</td><td>' + fmt(r.old_price) + '</td><td>' + fmt(r.new_price) + '</td>'
          + '<td>' + fmt(r.old_cost) + '</td><td>' + fmt(r.new_cost) + '</td>'
          + '<td class="' + (r.pct > 0 ? 'up' : r.pct < 0 ? 'down' : '') + '">' + pctStr(r.pct) + '</td>'
          + '<td>' + alertHtml + '</td>'
          + '<td><button class="mini" data-del="' + i + '">✕</button></td></tr>';
      }).join('');
      body.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () { basket.splice(Number(b.getAttribute('data-del')), 1); renderBasket(); };
      });
    }
    $('oldTotal').textContent = fmt(t.old_total);
    $('newTotal').textContent = fmt(t.new_total);
    $('diffTotal').textContent = (t.diff > 0 ? '+' : '') + fmt(t.diff);
    $('pctTotal').textContent = pctStr(t.pct);
    $('pctTotal').className = t.pct > 0 ? 'up' : t.pct < 0 ? 'down' : '';
  }

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(savedKey) || '[]'); } catch (e) { return []; }
  }
  function storeSaved(list) { localStorage.setItem(savedKey, JSON.stringify(list)); }
  function renderSaved() {
    var list = loadSaved();
    $('savedList').innerHTML = list.length ? list.map(function (b, i) {
      var t = M.basketTotals(b.rows);
      return '<li><strong>' + esc(b.name) + '</strong> — ' + esc(b.city || 'no city')
        + ' — ' + b.rows.length + ' items — ' + fmt(t.new_total) + '/month — ' + pctStr(t.pct)
        + ' <button class="mini" data-load="' + i + '">Load</button> <button class="mini" data-rm="' + i + '">Delete</button></li>';
    }).join('') : '<li>No saved baskets yet.</li>';
    $('savedList').querySelectorAll('[data-load]').forEach(function (b) {
      b.onclick = function () { basket = JSON.parse(JSON.stringify(list[Number(b.getAttribute('data-load'))].rows)); renderBasket(); };
    });
    $('savedList').querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () { list.splice(Number(b.getAttribute('data-rm')), 1); storeSaved(list); renderSaved(); renderCompareSelects(); };
    });
    renderCompareSelects();
  }
  function renderCompareSelects() {
    var list = loadSaved();
    var opts = '<option value="">—</option>' + list.map(function (b, i) {
      return '<option value="' + i + '">' + esc(b.name) + ' (' + esc(b.city || 'no city') + ')</option>';
    }).join('');
    $('cmpA').innerHTML = opts;
    $('cmpB').innerHTML = opts;
  }

  $('addBtn').onclick = function () {
    var sel = $('itemSelect');
    var item = spiItems[Number(sel.value)];
    if (!item) { alert('Pick an item first.'); return; }
    var qty = Number($('qtyInput').value), oldP = Number($('oldInput').value), newP = Number($('newInput').value);
    if (!(qty > 0) || !(oldP >= 0) || !(newP >= 0) || isNaN(qty) || isNaN(oldP) || isNaN(newP)) {
      alert('Enter a quantity above 0 and both prices (0 or more).'); return;
    }
    var target = $('targetInput').value === '' ? null : Number($('targetInput').value);
    basket.push({ name: item.name, unit: item.unit, qty: qty, old_price: oldP, new_price: newP, target_price: target });
    $('targetInput').value = '';
    renderBasket();
  };
  $('itemSelect').onchange = function () {
    var item = spiItems[Number($('itemSelect').value)];
    if (!item) return;
    $('pbsHint').textContent = 'PBS national average for ' + item.name + ': now ' + fmt(item.price_now)
      + ' / last week ' + fmt(item.price_prev_week) + ' / last year ' + fmt(item.price_year_ago)
      + ' (' + item.unit + '). You can copy these into the price boxes, or type your own shop prices.';
  };
  $('exampleBtn').onclick = function () {
    // EXAMPLE basket, built from real PBS prices (week ended 29-10-2026 vs
    // 22-10-2026). Labelled EXAMPLE everywhere it appears.
    basket = [
      { name: 'Tomatoes', unit: '1 kg', qty: 4, old_price: 93.17, new_price: 125.70, target_price: 100 },
      { name: 'Wheat Flour Bag', unit: '20 kg', qty: 1, old_price: 2976.12, new_price: 2951.46, target_price: null },
      { name: 'Chicken Farm Broiler (Live)', unit: '1 kg', qty: 2, old_price: 444.27, new_price: 431.15, target_price: null },
      { name: 'Milk fresh (Un-boiled)', unit: '1 litre', qty: 10, old_price: 218.92, new_price: 219.98, target_price: null },
      { name: 'Sugar Refined', unit: '1 kg', qty: 5, old_price: 141.61, new_price: 141.12, target_price: null },
    ];
    renderBasket();
  };
  $('clearBtn').onclick = function () { basket = []; renderBasket(); };
  $('saveBtn').onclick = function () {
    var name = $('saveName').value.trim();
    if (!name) { alert('Give the basket a name first.'); return; }
    if (!basket.length) { alert('Your basket is empty.'); return; }
    var list = loadSaved();
    list.push({ name: name, city: $('saveCity').value || '', rows: JSON.parse(JSON.stringify(basket)) });
    storeSaved(list);
    $('saveName').value = '';
    renderSaved();
  };
  $('cmpBtn').onclick = function () {
    var list = loadSaved();
    var a = list[Number($('cmpA').value)], b = list[Number($('cmpB').value)];
    if (!a || !b) { alert('Pick two saved baskets.'); return; }
    var ta = M.basketTotals(a.rows), tb = M.basketTotals(b.rows);
    $('cmpBox').innerHTML = '<table><thead><tr><th></th><th>' + esc(a.name) + ' (' + esc(a.city || 'no city') + ')</th><th>'
      + esc(b.name) + ' (' + esc(b.city || 'no city') + ')</th></tr></thead><tbody>'
      + '<tr><td>Items</td><td>' + a.rows.length + '</td><td>' + b.rows.length + '</td></tr>'
      + '<tr><td>Old monthly total</td><td>' + fmt(ta.old_total) + '</td><td>' + fmt(tb.old_total) + '</td></tr>'
      + '<tr><td>New monthly total</td><td>' + fmt(ta.new_total) + '</td><td>' + fmt(tb.new_total) + '</td></tr>'
      + '<tr><td>Difference / month</td><td>' + fmt(ta.diff) + '</td><td>' + fmt(tb.diff) + '</td></tr>'
      + '<tr><td><strong>Personal inflation</strong></td><td><strong>' + pctStr(ta.pct) + '</strong></td><td><strong>' + pctStr(tb.pct) + '</strong></td></tr>'
      + '</tbody></table><p class="note">Comparison uses each basket\'s own items and prices — different baskets can hold different items, so compare the rates, not just the totals.</p>';
  };

  fetch('/api/spi').then(function (r) { return r.json(); }).then(function (d) {
    spiItems = d.items || [];
    $('itemSelect').innerHTML = spiItems.map(function (it, i) {
      return '<option value="' + i + '">' + esc(it.name) + ' (' + esc(it.unit) + ')</option>';
    }).join('');
    if (d.latest) {
      $('spiWeek').textContent = d.latest.week_ended;
      $('spiValue').textContent = d.latest.combined_spi;
      $('spiWow').textContent = pctStr(d.latest.wow_pct);
      $('spiYoy').textContent = pctStr(d.latest.yoy_pct);
      $('spiSource').textContent = 'Official data — source: ' + d.source + '. Base year 2015-16 = 100. 51 essential items, 50 markets, 17 cities.';
      $('thNow').textContent = 'Now (' + d.latest.week_ended + ')';
      $('thPrev').textContent = 'Last week (' + d.prev_week_ended + ')';
      $('thYear').textContent = 'Last year (' + d.year_ago_ended + ')';
    }
    $('quintileBody').innerHTML = (d.quintiles || []).map(function (q) {
      return '<tr><td>' + esc(q.label) + '</td><td>' + esc(q.band) + '</td><td>' + esc(q.spi) + '</td><td>' + pctStr(q.wow_pct) + '</td><td>' + pctStr(q.yoy_pct) + '</td></tr>';
    }).join('');
    $('moversUp').innerHTML = (d.movers_up || []).map(function (m) {
      return '<li>' + esc(m.name) + ' — <strong class="up">' + pctStr(m.wow_pct) + '</strong> (' + fmt(m.price_prev_week) + ' → ' + fmt(m.price_now) + ')</li>';
    }).join('');
    $('moversDown').innerHTML = (d.movers_down || []).map(function (m) {
      return '<li>' + esc(m.name) + ' — <strong class="down">' + pctStr(m.wow_pct) + '</strong> (' + fmt(m.price_prev_week) + ' → ' + fmt(m.price_now) + ')</li>';
    }).join('');
    $('itemsBody').innerHTML = spiItems.map(function (it) {
      return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.unit) + '</td><td>' + fmt(it.price_now) + '</td><td>' + fmt(it.price_prev_week) + '</td><td>' + fmt(it.price_year_ago) + '</td>'
        + '<td class="' + (it.wow_pct > 0 ? 'up' : it.wow_pct < 0 ? 'down' : '') + '">' + pctStr(it.wow_pct) + '</td>'
        + '<td class="' + (it.yoy_pct > 0 ? 'up' : it.yoy_pct < 0 ? 'down' : '') + '">' + pctStr(it.yoy_pct) + '</td></tr>';
    }).join('');
  });
  fetch('/api/cities').then(function (r) { return r.json(); }).then(function (d) {
    $('saveCity').innerHTML = '<option value="">No city</option>' + (d.cities || []).map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
  });
  renderBasket();
  renderSaved();
})();
