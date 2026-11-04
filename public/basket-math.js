// Shared personal-basket maths for My Mehngai Index.
// UMD: works as a browser <script> (window.MehngaiMath) and in Node tests.
// A basket row: { qty, old_price, new_price } — prices are per unit, per the
// item's unit (kg, litre, bag, ...). Quantities are per month by convention
// (the basket is a monthly household basket), so totals are monthly rupees.
(function (root) {
  'use strict';
  function round2(n) { return Math.round(n * 100) / 100; }
  function rowTotals(row) {
    const qty = Number(row.qty) || 0;
    const oldP = Number(row.old_price) || 0;
    const newP = Number(row.new_price) || 0;
    const oldCost = round2(qty * oldP);
    const newCost = round2(qty * newP);
    const diff = round2(newCost - oldCost);
    const pct = oldCost > 0 ? round2(((newCost - oldCost) / oldCost) * 100) : null;
    return { old_cost: oldCost, new_cost: newCost, diff, pct };
  }
  // Spending-weighted personal inflation: totals first, then one percentage.
  // (A plain average of per-item % would over-weight cheap items.)
  function basketTotals(rows) {
    let oldTotal = 0, newTotal = 0;
    const detailed = (rows || []).map((r) => {
      const t = rowTotals(r);
      oldTotal = round2(oldTotal + t.old_cost);
      newTotal = round2(newTotal + t.new_cost);
      return { ...r, ...t };
    });
    const diff = round2(newTotal - oldTotal);
    const pct = oldTotal > 0 ? round2((diff / oldTotal) * 100) : null;
    return { rows: detailed, old_total: oldTotal, new_total: newTotal, diff, pct };
  }
  // Target-price flag for one row: null when no target is set.
  function targetFlag(row) {
    const target = row.target_price === '' || row.target_price === null || row.target_price === undefined
      ? null : Number(row.target_price);
    const now = Number(row.new_price);
    if (target === null || Number.isNaN(target) || Number.isNaN(now)) return null;
    if (now > target) return 'above';
    if (now < target) return 'below';
    return 'at';
  }
  const api = { rowTotals, basketTotals, targetFlag, round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MehngaiMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
