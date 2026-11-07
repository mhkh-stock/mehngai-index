// Shared admin CSV parsing for My Mehngai Index.
// UMD: works as a browser <script> (window.MehngaiCsv) and in Node tests.
// WHY right-anchored: a plain split(',') breaks on the quintile spending
// band itself — "Up to Rs 17,732" contains a comma, so the old parser read
// Q1 as band "Up to Rs 17", spi 732, wow 357.92, yoy -0.07 (garbled). The
// numeric fields are always LAST, so they are taken from the right; the
// head fields from the left; whatever is left in the middle (which may
// itself contain commas) is the middle field, joined back with ', '.
//   parseAdminLines(text, headCols, middleCol, tailCols)
//   quintiles: head ['label'], middle 'band', tail ['spi','wow_pct','yoy_pct']
//   items:     head ['name'],  middle 'unit', tail ['price_now','price_prev_week','price_year_ago']
// A missing/blank field becomes null (unknown), never 0.
(function (root) {
  'use strict';
  function parseAdminLines(text, headCols, middleCol, tailCols) {
    return String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var parts = l.split(',').map(function (p) { return p.trim(); });
      var obj = {};
      var n = parts.length;
      var nHead = headCols.length, nTail = tailCols.length;
      headCols.forEach(function (c, i) {
        obj[c] = i < n ? (parts[i] === '' ? null : parts[i]) : null;
      });
      tailCols.forEach(function (c, i) {
        // tail field i sits nTail - 1 - i places from the end.
        var idx = n - nTail + i;
        obj[c] = idx >= nHead && idx < n ? (parts[idx] === '' ? null : parts[idx]) : null;
      });
      var midStart = nHead, midEnd = n - nTail;
      var mid = midEnd > midStart ? parts.slice(midStart, midEnd).join(', ') : '';
      obj[middleCol] = mid === '' ? null : mid;
      return obj;
    });
  }
  var api = { parseAdminLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MehngaiCsv = api;
})(typeof window !== 'undefined' ? window : globalThis);
