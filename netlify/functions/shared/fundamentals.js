const statementFields = {
  quarterlyEps: 'quarterlyDilutedEPS',
  quarterlyRevenue: 'quarterlyTotalRevenue',
  annualEps: 'annualDilutedEPS',
  annualRevenue: 'annualTotalRevenue',
};

export async function fetchFundamentals(symbol, includeIncome = false) {
  const fields = includeIncome ? { ...statementFields, annualIncome: 'annualNetIncome' } : statementFields;
  const params = new URLSearchParams({
    type: Object.values(fields).join(','),
    period1: '1609459200',
    period2: String(Math.ceil(Date.now() / 1000)),
  });
  try {
    const response = await fetch(
      `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?${params}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const series = data?.timeseries?.result;
    if (!Array.isArray(series)) return null;
    const statements = {};
    for (const [name, field] of Object.entries(fields)) {
      const records = series.find(item => Array.isArray(item?.[field]) && item[field].length)?.[field] ?? [];
      statements[name] = records
        .filter(point => point?.asOfDate && Number.isFinite(point.reportedValue?.raw))
        .map(point => ({ date: point.asOfDate, value: point.reportedValue.raw, currency: point.currencyCode }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return Object.values(statements).some(points => points.length) ? statements : null;
  } catch {
    return null;
  }
}
