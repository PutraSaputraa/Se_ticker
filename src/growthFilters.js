export const salesTTMThreshold = 15;

export const growthCriteria = [
  { key: 'epsThisYear', label: 'EPS tahun ini', detail: 'Estimasi tahun fiskal', threshold: 20, finviz: 'fa_epsyoy' },
  { key: 'eps3Y', label: 'EPS 3 tahun', detail: 'Pertumbuhan majemuk per tahun', threshold: 15, finviz: 'fa_eps3years' },
  { key: 'eps5Y', label: 'EPS 5 tahun', detail: 'Pertumbuhan majemuk per tahun', threshold: 15, finviz: 'fa_eps5years' },
  { key: 'salesQuarter', label: 'Penjualan kuartalan', detail: 'Kuartal yang sama tahun lalu', threshold: 20, finviz: 'fa_salesqoq' },
  { key: 'salesTTM', label: 'Penjualan 12 bulan', detail: 'Dibanding 12 bulan sebelumnya', threshold: salesTTMThreshold, finviz: 'fa_salesyoyttm' },
  { key: 'epsNextYear', label: 'EPS tahun depan', detail: 'Estimasi tahun fiskal', threshold: 15, finviz: 'fa_epsyoy1' },
];

export function growthCheck(row, rule) {
  const value = row[rule.key];
  if (!Number.isFinite(value)) {
    const comparison = rule.key === 'salesTTM' && row.salesTTMComparison;
    if (comparison?.threshold === rule.threshold && typeof comparison.passed === 'boolean') return comparison.passed ? 'pass' : 'fail';
    return 'missing';
  }
  // Discard floating-point noise at the boundary, without rounding to the displayed precision.
  return Number(value.toFixed(10)) > rule.threshold ? 'pass' : 'fail';
}

export function growthStatus(row, criteria) {
  const checks = criteria.map(rule => growthCheck(row, rule));
  if (checks.includes('fail')) return 'fail';
  return checks.includes('missing') ? 'missing' : 'pass';
}
