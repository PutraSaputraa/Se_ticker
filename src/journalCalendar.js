export function shiftCalendarMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCFullYear(year, number - 1 + offset, 1);
  return date.toISOString().slice(0, 7);
}

export function buildPnlCalendar(month, daily) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const leading = (first.getUTCDay() + 6) % 7;
  const next = new Date(`${shiftCalendarMonth(month, 1)}-01T00:00:00Z`);
  next.setUTCDate(0);
  const length = next.getUTCDate();
  const entries = new Map(daily.filter(({ date }) => date.startsWith(`${month}-`)).map((entry) => [entry.date, entry]));
  const weeks = Array.from({ length: Math.ceil((leading + length) / 7) }, (_, week) => (
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - leading + 1;
      if (day < 1 || day > length) return null;
      const date = `${month}-${String(day).padStart(2, '0')}`;
      return { day, date, entry: entries.get(date) ?? null };
    })
  ));
  let count = 0;
  let pnl = 0;
  for (const entry of entries.values()) {
    count += entry.count;
    pnl += entry.pnl;
  }
  return { weeks, count, pnl: Number(pnl.toPrecision(15)) };
}
