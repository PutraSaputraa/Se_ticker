import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretProfitFactor, summarizeProfitFactors } from '../src/journal.js';

test('profit factor memakai nominal posisi ditutup dalam mata uang yang sama', () => {
  const journal = [
    { status: 'win', quoteCurrency: 'IDR', positionUsd: 500, pnlPct: 10 },
    { status: 'loss', quoteCurrency: 'USD', positionUsd: 1000, pnlPct: -2 },
    { status: 'be', quoteCurrency: 'JPY', positionUsd: 300, pnlPct: 0 },
    { status: 'open', quoteCurrency: 'USD', positionUsd: 10_000, pnlPct: -50 },
    { status: 'loss', quoteCurrency: 'IDR', pnl: -2000, pnlPct: -10 },
    { status: 'win', pnl: 10 },
  ];

  assert.deepEqual(summarizeProfitFactors(journal, 'USD'), [{ currency: 'USD', count: 4, value: 3 }]);
});

test('PnL manual dalam mata uang lain dihitung dengan basisnya sendiri', () => {
  const journal = [
    { status: 'win', quoteCurrency: 'IDR', positionUsd: 500, pnlPct: 10 },
    { status: 'loss', quoteCurrency: 'USD', positionUsd: 1000, pnlPct: -2 },
    { status: 'win', pnl: 150_000 },
    { status: 'loss', pnl: -100_000 },
  ];

  assert.deepEqual(summarizeProfitFactors(journal, 'IDR'), [
    { currency: 'IDR', count: 2, value: 1.5 },
    { currency: 'USD', count: 2, value: 2.5 },
  ]);
});

test('profit factor menangani hasil kosong, untung saja, rugi saja, dan break-even', () => {
  const factor = (...amounts) => summarizeProfitFactors(amounts.map((pnl) => ({ pnl })), 'USD')[0]?.value;
  assert.equal(factor(), undefined);
  assert.equal(factor(0, 0), null);
  assert.equal(factor(25, 0), Infinity);
  assert.equal(factor(0, -25), 0);
  assert.equal(factor(0.1, 0.2, -0.3), 1);
});

test('interpretasi profit factor mencakup batas dan sela antarrentang', () => {
  assert.equal(interpretProfitFactor(0.99), 'Losing system');
  assert.equal(interpretProfitFactor(1), 'Break-even sebelum biaya');
  assert.equal(interpretProfitFactor(1.05), 'Tipis');
  assert.equal(interpretProfitFactor(1.3), 'Lumayan');
  assert.equal(interpretProfitFactor(1.5), 'Bagus');
  assert.equal(interpretProfitFactor(2), 'Sangat bagus');
  assert.equal(interpretProfitFactor(3), 'Sangat bagus');
  assert.equal(interpretProfitFactor(3.01), 'Excellent. Cek apakah sampel cukup besar');
  assert.equal(interpretProfitFactor(Infinity), 'Belum ada posisi rugi');
});
