export function shiftCalendarMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCFullYear(year, number - 1 + offset, 1);
  return date.toISOString().slice(0, 7);
}

export function shiftCalendarDate(date, offset) {
  const day = new Date(date + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

function summarizeCalendar(weeks) {
  let count = 0;
  let pnl = 0;
  for (const cell of weeks.flat()) {
    if (!cell?.entry) continue;
    count += cell.entry.count;
    pnl += cell.entry.pnl;
  }
  return { weeks, count, pnl: Number(pnl.toPrecision(15)) };
}

export function buildPnlWeek(date, daily) {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  const start = shiftCalendarDate(date, -((weekday + 6) % 7));
  const end = shiftCalendarDate(start, 6);
  const entries = new Map(daily.filter((entry) => entry.date >= start && entry.date <= end).map((entry) => [entry.date, entry]));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftCalendarDate(start, index);
    return { day: Number(date.slice(-2)), date, entry: entries.get(date) ?? null };
  });
  return { ...summarizeCalendar([week]), start, end };
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
  return summarizeCalendar(weeks);
}
