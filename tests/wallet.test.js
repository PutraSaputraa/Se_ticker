import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountChangeError, normalizeAccountData } from '../src/accountData.js';
import { calculateTradePnl, parseJournalLeverage, positionPnlUsd, realizedTradePnl } from '../src/journal.js';
import { closeWalletPosition, openWalletPosition, parseWalletUsd, recordWalletCash, removeWalletPosition, summarizeWallet } from '../src/wallet.js';

const at = Date.parse('2026-02-03T03:00:00Z');
const trade = {
  id: 'trade', pair: 'NVDA', date: '2026-02-02', status: 'open', side: 'long',
  entryPrice: 100, quoteCurrency: 'USD', positionUsd: 200,
};
const quote = { date: '2026-02-03', price: 112.345, currency: 'USD' };
const deposit = (account, cents, id = 'deposit') => recordWalletCash(account, { id, kind: 'deposit', cents, at });
const balances = (account) => {
  const { availableCents, reservedCents, equityCents } = summarizeWallet(account.wallet);
  return [availableCents, reservedCents, equityCents];
};

test('wallet memindahkan dana ke posisi dan mengembalikan dana serta PnL tepat satu kali', () => {
  assert.equal(parseWalletUsd('10,05'), 1005);
  for (const invalid of ['1.005', '0', '-5', '1e5', '1000000000000000']) assert.equal(parseWalletUsd(invalid), null);

  const funded = deposit(normalizeAccountData({ capital: 1_000_000, currency: 'IDR' }), 50_000);
  assert.equal(deposit(funded, 50_000), funded);
  const opened = openWalletPosition(funded, trade, at);
  assert.deepEqual(balances(opened), [30_000, 20_000, 50_000]);
  assert.equal(openWalletPosition(opened, trade, at), opened);
  assert.throws(() => openWalletPosition(opened, { ...trade, id: 'too-much', positionUsd: 300.01 }, at), AccountChangeError);
  assert.throws(() => recordWalletCash(opened, { id: 'too-much', kind: 'withdraw', cents: 30_001, at }), AccountChangeError);

  const closed = normalizeAccountData(closeWalletPosition(opened, trade.id, quote, at));
  assert.deepEqual(balances(closed), [52_469, 0, 52_469]);
  assert.deepEqual(realizedTradePnl(closed.journal[0], 'IDR'), { currency: 'USD', amount: 24.69 });
  assert.equal(closeWalletPosition(closed, trade.id, quote, at), closed);
  assert.equal(closed.capital, 1_000_000);
  assert.deepEqual(closed.wallet.map(({ kind, at: time }) => [kind, time]), [
    ['deposit', at], ['open', at + 1], ['close', at + 2],
  ]);
  assert.deepEqual(balances(removeWalletPosition(closed, trade.id, at)), balances(closed));
});

test('pembatalan melepas dana dan posisi lama tidak mengubah saldo wallet', () => {
  const legacy = { ...trade, id: 'legacy' };
  const funded = deposit(normalizeAccountData({ journal: [legacy] }), 50_000);
  const opened = openWalletPosition(funded, trade, at);
  const cancelled = removeWalletPosition(opened, trade.id, at);
  assert.deepEqual(balances(cancelled), [50_000, 0, 50_000]);
  assert.equal(removeWalletPosition(cancelled, trade.id, at), cancelled);
  assert.equal(openWalletPosition(cancelled, trade, at), cancelled);
  const closed = closeWalletPosition(cancelled, legacy.id, quote, at);
  assert.equal(closed.journal[0].status, 'win');
  assert.equal(closed.wallet, cancelled.wallet);
  const withdrawn = recordWalletCash(closed, { id: 'withdraw', kind: 'withdraw', cents: 50_000, at });
  assert.deepEqual(balances(withdrawn), [0, 0, 0]);
});

test('kerugian short yang melampaui dana tetap bisa dicatat sebagai defisit', () => {
  const funded = deposit(normalizeAccountData(), 20_000);
  const opened = openWalletPosition(funded, { ...trade, side: 'short' }, at);
  const closed = closeWalletPosition(opened, trade.id, { ...quote, price: 250 }, at);
  assert.deepEqual(balances(closed), [-10_000, 0, -10_000]);
  assert.throws(() => openWalletPosition(closed, { ...trade, id: 'new' }, at), AccountChangeError);
  assert.deepEqual(balances(deposit(closed, 15_000, 'recovery')), [5000, 0, 5000]);
});

test('posisi futures memakai tanggal kuotasi di zona saat dicatat dan menyimpan notes setelah ditutup', () => {
  const funded = deposit(normalizeAccountData(), 50_000);
  const opened = openWalletPosition(funded, {
    ...trade,
    date: '2026-11-16',
    type: 'futures',
    entryTimeZone: 'Asia/Jakarta',
    notes: 'Cek volume\nPantau sesi berikutnya',
  }, at);
  const updatedQuote = { ...quote, date: '2026-11-15', timestamp: Date.parse('2026-11-15T18:00:00Z') / 1000 };
  const staleQuote = { ...updatedQuote, timestamp: Date.parse('2026-11-15T16:00:00Z') / 1000 };

  assert.throws(() => closeWalletPosition(opened, trade.id, staleQuote, at), /Harga terakhir mendahului harga masuk/);
  const reloaded = normalizeAccountData(opened);
  const closed = normalizeAccountData(closeWalletPosition(reloaded, trade.id, updatedQuote, at));
  assert.deepEqual(balances(closed), [52_469, 0, 52_469]);
  assert.equal(closed.journal[0].type, 'futures');
  assert.equal(closed.journal[0].exitDate, '2026-11-16');
  assert.equal(closed.journal[0].notes, 'Cek volume\nPantau sesi berikutnya');
});

test('input leverage mendukung desimal dan membatasi nilai posisi pada rentang yang dapat dicatat', () => {
  assert.equal(parseJournalLeverage('10×', 10_000), 10);
  assert.equal(parseJournalLeverage('2,5', 10_000), 2.5);
  for (const invalid of ['', '0', '0.5', '-1', '1e2', '1.000,5', '999999999999999']) {
    assert.equal(parseJournalLeverage(invalid, 10_000), null);
  }
});

test('futures menahan margin dan memakai leverage untuk PnL berjalan serta PnL terealisasi', () => {
  const funded = deposit(normalizeAccountData(), 10_000);
  for (const [side, exitPrice, expectedPnl] of [
    ['long', 105, 50],
    ['long', 95, -50],
    ['short', 95, 50],
    ['short', 105, -50],
  ]) {
    const opened = normalizeAccountData(openWalletPosition(funded, {
      ...trade, side, type: 'futures', leverage: 10, positionUsd: 100,
    }, at));
    assert.deepEqual(balances(opened), [0, 10_000, 10_000]);
    const [position] = opened.journal;
    assert.equal(position.leverage, 10);
    const running = calculateTradePnl(position, exitPrice);
    assert.equal(running.pnlPct, expectedPnl);
    assert.equal(positionPnlUsd(position, running.pnlPct), expectedPnl);

    const exit = { ...quote, price: exitPrice };
    const closed = normalizeAccountData(closeWalletPosition(opened, position.id, exit, at));
    assert.deepEqual(balances(closed), [10_000 + expectedPnl * 100, 0, 10_000 + expectedPnl * 100]);
    assert.equal(closed.journal[0].pnlPct, expectedPnl);
    assert.equal(realizedTradePnl(closed.journal[0], 'USD').amount, expectedPnl);
    assert.equal(closeWalletPosition(closed, position.id, exit, at), closed);
  }

  const spot = openWalletPosition(funded, { ...trade, type: 'spot', positionUsd: 100, leverage: 10 }, at);
  assert.equal(spot.journal[0].leverage, undefined);
  assert.equal(calculateTradePnl(spot.journal[0], 105).pnlPct, 5);
});
