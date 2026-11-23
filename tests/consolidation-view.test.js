import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  consolidationCoverage,
  getConsolidationPosition,
  readConsolidationCloses,
  selectConsolidationCandidates,
} from '../src/consolidationView.js';

const base = {
  support: { low: 80, high: 85, touches: 3 },
  resistance: { low: 115, high: 120, touches: 2 },
};

test('price locations use raw outer boundaries and retain explicit outside values', () => {
  const locate = close => getConsolidationPosition({ ...base, close, positionPct: 0 });
  assert.deepEqual(locate(80), { location: 'support', pct: 0 });
  assert.deepEqual(locate(88), { location: 'support', pct: 20 });
  assert.equal(locate(88.001).location, 'middle');
  assert.deepEqual(locate(100), { location: 'middle', pct: 50 });
  assert.equal(locate(111.999).location, 'middle');
  assert.deepEqual(locate(112), { location: 'resistance', pct: 80 });
  assert.deepEqual(locate(120), { location: 'resistance', pct: 100 });
  assert.deepEqual(locate(76), { location: 'outside', pct: -10, side: 'below' });
  assert.deepEqual(locate(130), { location: 'outside', pct: 125, side: 'above' });
  assert.equal(locate(null).location, 'unavailable');
  assert.equal(getConsolidationPosition({ ...base, close: 100, support: { low: 97, high: 117 } }).location, 'unavailable');
});

test('filters share classification and sorts are numeric, stable, and missing-last', () => {
  const make = (symbol, close, duration, touches) => {
    const pick = { ...base, symbol, close, duration, support: { ...base.support, touches } };
    return { pick, position: getConsolidationPosition(pick) };
  };
  const rows = [make('MID', 100, 60, 2), make('LOW', 83, 120, 11), make('LEGACY', null, null, null),
    make('HIGH', 116, 40, 3), make('OUT', 122, 60, 2)];
  const symbols = rows => rows.map(row => row.pick.symbol);
  const select = (location, sort) => symbols(selectConsolidationCandidates(rows, location, sort));
  assert.deepEqual(select('all', 'default'), symbols(rows));
  assert.deepEqual(select('support', 'default'), ['LOW']);
  assert.deepEqual(select('outside', 'default'), ['OUT']);
  assert.deepEqual(select('all', 'longest'), ['LOW', 'MID', 'OUT', 'HIGH', 'LEGACY']);
  assert.deepEqual(select('all', 'shortest'), ['HIGH', 'MID', 'OUT', 'LOW', 'LEGACY']);
  assert.deepEqual(select('all', 'supportReactions'), ['LOW', 'HIGH', 'MID', 'OUT', 'LEGACY']);
  assert.deepEqual(select('all', 'support'), ['LOW', 'MID', 'HIGH', 'OUT', 'LEGACY']);
  assert.deepEqual(select('all', 'resistance'), ['OUT', 'HIGH', 'MID', 'LOW', 'LEGACY']);
  assert.deepEqual(select('all', 'ticker'), ['HIGH', 'LEGACY', 'LOW', 'MID', 'OUT']);
  assert.equal(rows[0].pick.symbol, 'MID');
});

test('coverage and snapshots reject inconsistent counts, sessions, and close prices', () => {
  assert.deepEqual(consolidationCoverage(30, 29), { pct: 29 / 30 * 100, unavailable: 1 });
  assert.equal(consolidationCoverage(0, 0), null);
  assert.equal(consolidationCoverage(15, 30), null);
  assert.equal(consolidationCoverage(15, null), null);

  const pick = { ...base, close: 104, date: '2026-06', duration: 2, closes: [['2026-05', 101], ['2026-06', 104]] };
  assert.deepEqual(readConsolidationCloses(pick, 'monthly'), pick.closes);
  assert.equal(readConsolidationCloses({ ...pick, closes: [['2026-05', 101], ['2026-07', 104]] }, 'monthly'), null);
  assert.equal(readConsolidationCloses({ ...pick, close: 105 }, 'monthly'), null);
  assert.equal(readConsolidationCloses({ ...pick, closes: [['2026-06', 101], ['2026-06', 104]] }, 'monthly'), null);
  assert.equal(readConsolidationCloses({ ...pick, closes: null }, 'monthly'), null);
  assert.equal(readConsolidationCloses(pick, 'daily'), null);
});
