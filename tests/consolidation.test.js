import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findActiveConsolidation } from '../netlify/functions/shared/consolidationLogic.js';

const cycle = [90, 95, 100, 105, 110, 105, 100, 95, 90, 85, 80, 85];

function candles(closes) {
  return closes.map(close => ({ high: close + 1, low: close - 1, close }));
}

function scanDaily(closes) {
  const bars = candles(closes);
  return findActiveConsolidation(bars, bars.length - 1, 'daily');
}

test('deteksi range harian yang lebar dari pantulan berulang', () => {
  const closes = [...Array.from({ length: 10 }, () => cycle).flat(), 95];
  const result = scanDaily(closes);
  assert.equal(result.support.low, 79);
  assert.equal(result.resistance.high, 111);
  assert.ok(result.support.touches >= 2 && result.resistance.touches >= 2);
  assert.equal(result.insideRatio, 1);
  assert.equal(result.positionPct, 50);
  assert.equal(result.duration, 120);
});

test('wick boleh keluar tetapi penutupan di luar zona menggugurkan kandidat', () => {
  const history = candles(Array.from({ length: 6 }, () => cycle).flat());
  const evaluate = close => findActiveConsolidation([...history, { high: 140, low: 50, close }], history.length, 'daily');

  assert.equal(evaluate(111).positionPct, 100);
  assert.equal(evaluate(79).positionPct, 0);
  assert.equal(evaluate(111.01), null);
  assert.equal(evaluate(78.99), null);
});

test('ayunan yang berkerumun di resistance dihitung satu kali', () => {
  const lows = Array.from({ length: 7 }, () => [94, 92, 86, 81, 86, 92, 94, 96]).flat();
  const clustered = [104, 107, 111, 109, 109, 111, 109, 109, 111, 109, 109, 108];
  assert.equal(scanDaily([...lows, ...clustered]), null);

  const returnedToRange = [104, 107, 111, 104, 96, 92, 105, 111, 109, 109, 108];
  assert.equal(scanDaily([...lows, ...returnedToRange]).resistance.touches, 2);
});

test('tren satu arah dan riwayat yang terlalu pendek dilewati', () => {
  assert.equal(scanDaily(Array.from({ length: 120 }, (_, index) => 60 + index)), null);
  assert.equal(scanDaily([...cycle, ...cycle, ...cycle]), null);
});
