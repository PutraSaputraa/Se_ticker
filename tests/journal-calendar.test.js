import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPnlCalendar, buildPnlWeek, shiftCalendarMonth } from '../src/journalCalendar.js';

test('moves across years in both directions', () => {
  assert.equal(shiftCalendarMonth('2025-12', 1), '2026-01');
  assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12');
});

test('places leap-day dates in a Monday-first grid', () => {
  const { weeks } = buildPnlCalendar('2024-02', []);
  assert.equal(weeks[0][0], null);
  assert.equal(weeks[0][3].date, '2024-02-01');
  assert.equal(weeks.at(-1)[3].date, '2024-02-29');
  assert.equal(buildPnlCalendar('2025-02', []).weeks.flat().filter(Boolean).length, 28);
});

test('sums only the displayed month and distinguishes break-even from no close', () => {
  const calendar = buildPnlCalendar('2026-01', [
    { date: '2025-12-31', count: 1, pnl: 1000 },
    { date: '2026-01-01', count: 2, pnl: 25 },
    { date: '2026-01-02', count: 1, pnl: 0 },
    { date: '2026-01-04', count: 1, pnl: -5 },
    { date: '2026-02-01', count: 1, pnl: 1000 },
  ]);
  assert.equal(calendar.count, 4);
  assert.equal(calendar.pnl, 20);
  assert.equal(calendar.weeks[0][4].entry.pnl, 0);
  assert.equal(calendar.weeks[0][5].entry, null);
});

test('a weekly view carries actual closures across a year boundary and includes weekends', () => {
  const calendar = buildPnlWeek('2026-01-01', [
    { date: '2025-12-28', count: 9, pnl: 900 },
    { date: '2025-12-31', count: 1, pnl: 50 },
    { date: '2026-01-04', count: 2, pnl: -30 },
    { date: '2026-01-05', count: 8, pnl: 100 },
  ]);
  assert.equal(calendar.start, '2025-12-29');
  assert.equal(calendar.end, '2026-01-04');
  assert.equal(calendar.weeks[0][6].entry.pnl, -30);
  assert.equal(calendar.count, 3);
  assert.equal(calendar.pnl, 20);
});
