/**
 * Convert integer paise to a ₹-formatted string.
 * This is the ONLY place paise → rupees conversion happens in the UI.
 *
 * @param {number} paise - integer paise value (positive or negative)
 * @param {object} opts
 * @param {boolean} opts.compact  - use K/L/Cr suffixes for large amounts
 * @param {boolean} opts.showSign - always show + or – prefix
 * @returns {string}  e.g. "₹1,23,456" or "–₹4,50,000" or "₹12.5L"
 */
export function formatMoney(paise, { compact = false, showSign = false } = {}) {
  if (paise === null || paise === undefined || isNaN(paise)) return '—';

  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = abs / 100; // convert to rupees for display only

  let formatted;

  if (compact) {
    if (rupees >= 1_00_00_000) {
      formatted = `₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
    } else if (rupees >= 1_00_000) {
      formatted = `₹${(rupees / 1_00_000).toFixed(1)}L`;
    } else if (rupees >= 1_000) {
      formatted = `₹${(rupees / 1_000).toFixed(1)}K`;
    } else {
      formatted = `₹${rupees.toFixed(0)}`;
    }
  } else {
    // Indian comma formatting: last 3 digits, then groups of 2
    const parts = rupees.toFixed(0).split('.');
    const num = parts[0];
    let result = '';
    const last3 = num.slice(-3);
    const rest = num.slice(0, -3);
    if (rest.length > 0) {
      result = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
    } else {
      result = last3;
    }
    formatted = `₹${result}`;
  }

  if (negative) {
    return `–${formatted}`;
  }
  if (showSign && paise > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Format a date string or Date object to a short display label.
 * @param {string|Date} d
 * @param {'short'|'long'|'day'} style
 */
export function formatDate(d, style = 'short') {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (style === 'day') {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  if (style === 'long') {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }
  // short: "25 Aug"
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
