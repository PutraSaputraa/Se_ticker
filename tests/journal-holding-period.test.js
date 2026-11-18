import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdingPeriodDays, normalizeTrade } from '../src/journal.js';

test('holding posisi ditutup memakai selisih hari kalender dari masuk sampai keluar', () => {
  assert.equal(holdingPeriodDays({ status: 'win', date: '2026-11-13', exitDate: '2026-11-18' }), 5);
  assert.equal(holdingPeriodDays({ status: 'loss', date: '2026-11-18', exitDate: '2026-11-18' }), 0);
  assert.equal(holdingPeriodDays({ status: 'be', date: '2024-02-28', exitDate: '2024-03-01' }), 2);
  assert.equal(holdingPeriodDays({ status: 'win', date: '2026-03-07', exitDate: '2026-03-09' }), 2);
});

test('holding posisi terbuka mengikuti tanggal hari ini dan pergantian hari', () => {
  const trade = { status: 'open', date: '2026-11-13' };
  assert.equal(holdingPeriodDays(trade, new Date(2026, 10, 18, 23, 59)), 5);
  assert.equal(holdingPeriodDays(trade, new Date(2026, 10, 19, 0, 0)), 6);
});

test('futures mengikuti zona tanggal masuk yang tersimpan', () => {
  const trade = { status: 'open', date: '2026-11-17', type: 'futures', entryTimeZone: 'America/New_York' };
  assert.equal(holdingPeriodDays(trade, new Date('2026-11-18T01:00:00Z')), 0);
  assert.equal(holdingPeriodDays(trade, new Date('2026-11-18T06:00:00Z')), 1);
  const localTrade = { ...trade, entryTimeZone: 'invalid-zone' };
  assert.equal(holdingPeriodDays(localTrade, new Date(2026, 10, 18)), 1);
});

test('tanggal hilang, tanggal tidak valid, dan urutan terbalik tidak menjadi nol hari', () => {
  const base = { status: 'win', date: '2026-11-13', exitDate: '2026-11-18' };
  for (const trade of [
    { ...base, date: undefined },
    { ...base, date: '2026-02-30' },
    { ...base, exitDate: null },
    { ...base, exitDate: '2026-11-31' },
    { ...base, exitDate: '2026-11-12' },
  ]) assert.equal(holdingPeriodDays(trade), null);
  assert.equal(holdingPeriodDays({ status: 'open', date: '2026-11-19' }, new Date(2026, 10, 18)), null);
});

test('posisi lama memakai tanggal yang tersedia, entri manual tanpa tanggal keluar tetap kosong', () => {
  const dated = normalizeTrade({ pair: 'DEMO', status: 'win', date: '2026-11-01', exitDate: '2026-11-13',
    entryPrice: 100, quoteCurrency: 'USD' });
  assert.equal(holdingPeriodDays(dated), 12);
  const manual = normalizeTrade({ pair: 'DEMO', status: 'win', date: '2026-11-13', pnl: 10 });
  assert.equal(holdingPeriodDays(manual), null);
});
