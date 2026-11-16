import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tradeFromTriggeredSetup } from '../src/journalSetups.js';
import { normalizeTicker } from '../src/tickers.js';

const quote = {
  symbol: 'BTC-USD',
  date: '2026-11-16',
  currency: 'USD',
  timestamp: Date.parse('2026-11-16T01:00:00Z') / 1000,
  price: 120,
};
const setup = {
  id: 'pending-btc',
  pair: 'BTC-USD',
  market: 'crypto',
  date: '2026-11-15',
  createdAt: { toMillis: () => quote.timestamp * 1000 - 500 },
  side: 'long',
  type: 'spot',
  timeframe: '4H',
  setup: 'Support',
  thesis: 'Uji breakout.',
  positionCents: 10_000,
  limitPrice: 120,
  stopLoss: 114,
  takeProfit: 138,
  rewardMultiple: 3,
  quoteCurrency: 'USD',
  triggerAbove: true,
};

test('harga yang menyentuh atau melampaui limit membuka posisi dengan level dari setup', () => {
  assert.equal(tradeFromTriggeredSetup(setup, { ...quote, price: 119 }), null);
  assert.equal(tradeFromTriggeredSetup(setup, quote).entryPrice, 120);
  const trade = tradeFromTriggeredSetup(setup, { ...quote, price: 121 });
  assert.equal(trade.id, setup.id);
  assert.equal(trade.status, 'open');
  assert.equal(trade.date, quote.date);
  assert.equal(trade.entryTimestamp, quote.timestamp);
  assert.equal(trade.entryPrice, 121);
  assert.equal(trade.notes, setup.thesis);
  assert.deepEqual([trade.stopLoss, trade.takeProfit, trade.positionUsd], [114, 138, 100]);
  assert.deepEqual(trade.setupPlan, { limitPrice: 120, date: '2026-11-15', market: 'crypto', timeframe: '4H' });
});

test('batas turun memakai perbandingan inklusif, terlepas dari Direction posisi', () => {
  const buyDip = { ...setup, triggerAbove: false };
  assert.equal(tradeFromTriggeredSetup(buyDip, { ...quote, price: 121 }), null);
  assert.equal(tradeFromTriggeredSetup(buyDip, quote).side, 'long');
  assert.equal(tradeFromTriggeredSetup(buyDip, { ...quote, price: 119 }).entryPrice, 119);
});

test('kuotasi sebelum setup disimpan, beda ticker, atau beda mata uang tidak memicu posisi', () => {
  for (const changes of [
    { timestamp: quote.timestamp - 1 },
    { timestamp: null },
    { symbol: 'ETH-USD' },
    { currency: 'JPY' },
  ]) {
    assert.equal(tradeFromTriggeredSetup(setup, { ...quote, ...changes }), null);
  }
});

test('pemilihan market menormalkan kode ticker sesuai bursa', () => {
  assert.equal(normalizeTicker('700', 'hk'), '0700.HK');
  assert.equal(normalizeTicker('5930', 'ks'), '005930.KS');
  assert.equal(normalizeTicker('2330', 'tw'), '2330.TW');
  assert.equal(normalizeTicker('6488', 'two'), '6488.TWO');
  assert.equal(normalizeTicker('BTC', 'crypto'), 'BTC-USD');
});
