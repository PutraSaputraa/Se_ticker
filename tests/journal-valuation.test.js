import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLevels } from '../src/journalLevels.js';
import { estimateTradeRisk, summarizeOpenPositions } from '../src/journalValuation.js';

const form = {
  side: 'long', type: 'spot', positionUsd: '500,00', leverage: '1',
  entryPrice: '100', stopLoss: '95', takeProfit: '110',
};

test('the risk preview uses the same position basis for manual and generated spot exits', () => {
  for (const input of [form, { ...form, stopLossPct: '5', rewardMultiple: '2' }]) {
    const result = estimateTradeRisk(input, calculateLevels(input), 100_000);
    assert.equal(result.loss, 25);
    assert.equal(result.profit, 50);
    assert.equal(result.reward, 2);
    assert.equal(result.capitalAtRisk, 0.025);
  }
});

test('futures risk respects the short direction and applies leverage once to margin', () => {
  const input = { ...form, positionUsd: '200', side: 'short', type: 'futures', leverage: '3×', stopLoss: '105', takeProfit: '90' };
  const result = estimateTradeRisk(input, calculateLevels(input), 100_000);
  assert.equal(result.loss, 30);
  assert.equal(result.profit, 60);
  assert.equal(result.reward, 2);
  assert.equal(result.capitalAtRisk, 0.03);
  const invalid = { ...input, leverage: '' };
  assert.equal(estimateTradeRisk(invalid, calculateLevels(invalid), 100_000).loss, null);
});

test('wrong-side and missing prices, zero risk, and unavailable equity are displayed separately', () => {
  const wrongSide = { ...form, stopLoss: '102', takeProfit: '100' };
  const invalid = estimateTradeRisk(wrongSide, calculateLevels(wrongSide), 100_000);
  assert.equal(invalid.invalidStop, true);
  assert.equal(invalid.invalidTarget, true);
  assert.equal(invalid.loss, null);
  assert.equal(invalid.reward, null);

  const incomplete = { ...form, takeProfit: '' };
  const partial = estimateTradeRisk(incomplete, calculateLevels(incomplete), 0);
  assert.equal(partial.loss, 25);
  assert.equal(partial.profit, null);
  assert.equal(partial.reward, null);
  assert.equal(partial.capitalAtRisk, null);
});

test('open positions return uses original spot value plus futures margin and requires full coverage', () => {
  const spot = { id: 'spot', positionUsd: 800 };
  const futures = { id: 'futures', positionUsd: 200, leverage: 4 };
  const values = new Map([
    ['spot', { pnlUsd: 80, quote: { timestamp: 1_780_000_001 } }],
    ['futures', { pnlUsd: -40, quote: { timestamp: 1_780_000_002 } }],
    ['legacy', { pnlUsd: null, quote: { timestamp: 1_780_000_003 } }],
  ]);
  assert.deepEqual(summarizeOpenPositions([spot, futures], values), {
    total: 40, priced: 2, returnPct: 4, timestamp: 1_780_000_002,
  });
  assert.deepEqual(summarizeOpenPositions([spot, futures, { id: 'legacy' }], values), {
    total: 40, priced: 2, returnPct: null, timestamp: 1_780_000_003,
  });
  assert.equal(summarizeOpenPositions([], new Map()).total, null);
});
