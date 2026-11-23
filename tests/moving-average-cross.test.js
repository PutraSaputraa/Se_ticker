import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findMovingAverageCrosses } from '../netlify/functions/shared/movingAverageCross.js';
import { completedCryptoDays, completedCryptoWeekIndex, cryptoWeeks } from '../netlify/functions/shared/sessionLogic.js';

const evaluate = closes => findMovingAverageCrosses(closes.map(close => ({ close })), closes.length - 1);
const directions = picks => picks.map(({ method, signal }) => [method, signal]);

test('SMA and EMA compare the current and preceding 50/200 averages', () => {
  const history = Array(200).fill(100);
  const [sma, ema] = evaluate([...history, 150]);
  assert.deepEqual(sma, { method: 'SMA', signal: 'golden', fast: 101, slow: 100.25 });
  assert.deepEqual(ema, { method: 'EMA', signal: 'golden', fast: 100 + 100 / 51, slow: 100 + 100 / 201 });
  assert.deepEqual(directions(evaluate([...history, 50])), [['SMA', 'death'], ['EMA', 'death']]);
  assert.deepEqual(evaluate([...history, 150, 150]), []);
  assert.deepEqual(evaluate(Array(201).fill(0.2)), []);
});

test('SMA and EMA can signal on different candles in either direction', () => {
  const base = [...Array(200).fill(1000), ...Array(50).fill(990)];
  const emaCross = [...base, 1160];
  const smaCross = [...emaCross, 1400];
  const mirror = closes => closes.map(close => 2000 - close);

  assert.deepEqual(directions(evaluate(emaCross)), [['EMA', 'golden']]);
  assert.deepEqual(directions(evaluate(smaCross)), [['SMA', 'golden']]);
  assert.deepEqual(directions(evaluate(mirror(emaCross))), [['EMA', 'death']]);
  assert.deepEqual(directions(evaluate(mirror(smaCross))), [['SMA', 'death']]);
});

test('the scanner requires 201 valid completed candles and excludes later bars', () => {
  const history = Array(200).fill(100);
  assert.equal(evaluate(history), null);
  assert.equal(evaluate([100, null, ...history.slice(1), 150]), null);
  assert.deepEqual(evaluate([null, ...history, 150]), evaluate([...history, 150]));

  const sessions = [...history, 100, 150].map(close => ({ close }));
  assert.deepEqual(findMovingAverageCrosses(sessions, 200), []);
});

test('the crypto calendar preserves missing days and samples only completed Sundays', () => {
  const sessions = [
    { date: '2026-11-08', close: 80 },
    { date: '2026-11-21', close: 100 },
    { date: '2026-11-22', close: 110 },
    { date: '2026-11-23', close: 120 },
  ];
  const weeklyCloses = (day) => {
    const days = completedCryptoDays(sessions, day);
    return cryptoWeeks(days, completedCryptoWeekIndex(days, day)).map(week => week.at(-1));
  };
  assert.deepEqual(completedCryptoDays(sessions, '2026-11-23').slice(-3), [
    { date: '2026-11-20', close: null }, ...sessions.slice(1, 3),
  ]);
  assert.deepEqual(weeklyCloses('2026-11-22'), [
    sessions[0], { date: '2026-11-15', close: null },
  ]);
  assert.deepEqual(weeklyCloses('2026-11-23'), [
    sessions[0], { date: '2026-11-15', close: null }, sessions[2],
  ]);
});
