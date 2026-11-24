import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Firestore } from '@google-cloud/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser,
  getAuth, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer,
  getDocsFromServer, getFirestore, query, serverTimestamp, setDoc, terminate, updateDoc, where,
} from 'firebase/firestore';
import { monitorJournalSetups } from '../netlify/functions/journal-setup-monitor.js';
import { mergeLegacyData, normalizeAccountData, updateAccountData } from '../src/accountData.js';
import { addTrade, closeTrade, positionPnlUsd } from '../src/journal.js';
import { journalSetupsCollection } from '../src/journalSetups.js';
import { closeWalletPosition, openWalletPosition, recordWalletCash, summarizeWallet } from '../src/wallet.js';
import { addSymbol, removeSymbol, setPriceToWatch, setWatchlistCategories } from '../src/watchlist.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Jalankan pengujian melalui Firebase Emulator Suite. Lihat README.');
}

const clients = [];
const password = 'Local-test-8675309!';
const email = `ticker-${crypto.randomUUID()}@example.test`;
let owner;
let secondDevice;
let outsider;
let guest;
let uid;

function createClient() {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-seticker' }, crypto.randomUUID());
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  const client = { app, auth, db };
  clients.push(client);
  return client;
}

before(async () => {
  owner = createClient();
  secondDevice = createClient();
  outsider = createClient();
  guest = createClient();
  uid = (await createUserWithEmailAndPassword(owner.auth, email, password)).user.uid;
  await signInWithEmailAndPassword(secondDevice.auth, email, password);
  await createUserWithEmailAndPassword(outsider.auth, `other-${email}`, password);
}, { timeout: 20000 });

after(async () => {
  if (owner?.auth.currentUser && uid) await deleteDoc(doc(owner.db, 'users', uid));
  await Promise.all(clients.map(async ({ app, auth, db }) => {
    if (auth.currentUser && auth !== secondDevice?.auth) await deleteUser(auth.currentUser);
    await terminate(db);
    await deleteApp(app);
  }));
});

test('pemilik dapat menyimpan dan membaca watchlist serta riwayat', async () => {
  await updateAccountData(owner.db, uid, () => ({
    watchlist: [{ symbol: 'BBCA.JK', priceToWatch: 9000 }],
    history: ['BBCA.JK'],
  }));
  const snapshot = await getDocFromServer(doc(owner.db, 'users', uid));
  assert.equal(snapshot.data().watchlist[0].priceToWatch, 9000);
  assert.deepEqual(snapshot.data().history, ['BBCA.JK']);
  assert.ok(snapshot.data().updatedAt);
});

test('tamu dan akun lain ditolak untuk baca, tulis, hapus, serta daftar akun', async () => {
  const data = { watchlist: [], history: [], updatedAt: serverTimestamp() };
  for (const client of [guest, outsider]) {
    const reference = doc(client.db, 'users', uid);
    await assert.rejects(getDocFromServer(reference), { code: 'permission-denied' });
    await assert.rejects(setDoc(reference, data), { code: 'permission-denied' });
    await assert.rejects(deleteDoc(reference), { code: 'permission-denied' });
    await assert.rejects(getDocsFromServer(collection(client.db, 'users')), { code: 'permission-denied' });
  }
  await assert.rejects(setDoc(doc(owner.db, 'other', uid), data), { code: 'permission-denied' });
});

test('aturan menolak dokumen di luar skema akun', async () => {
  const reference = doc(owner.db, 'users', uid);
  const valid = { watchlist: [], history: [], updatedAt: serverTimestamp() };
  await assert.rejects(setDoc(reference, { ...valid, admin: true }), { code: 'permission-denied' });
  await assert.rejects(setDoc(reference, { ...valid, watchlist: 'invalid' }), { code: 'permission-denied' });
  await assert.rejects(setDoc(reference, { ...valid, history: Array(6).fill('BBCA.JK') }), { code: 'permission-denied' });
  await assert.rejects(setDoc(reference, { ...valid, journal: {} }), { code: 'permission-denied' });
  await assert.rejects(setDoc(reference, { ...valid, wallet: {} }), { code: 'permission-denied' });
});

test('perubahan serentak dari dua perangkat mempertahankan kedua ticker', async () => {
  await Promise.all([
    updateAccountData(owner.db, uid, (current) => ({ ...current, watchlist: addSymbol(current.watchlist, 'AAPL') })),
    updateAccountData(secondDevice.db, uid, (current) => ({ ...current, watchlist: addSymbol(current.watchlist, '7203.T') })),
  ]);
  const snapshot = await getDocFromServer(doc(owner.db, 'users', uid));
  assert.deepEqual(snapshot.data().watchlist.map(({ symbol }) => symbol).sort(), ['7203.T', 'AAPL', 'BBCA.JK']);
  assert.deepEqual(snapshot.data().history, ['BBCA.JK']);
});

test('impor data lama aman diulang dan mempertahankan harga pantauan di akun', async () => {
  const legacy = normalizeAccountData({
    watchlist: ['NVDA', { symbol: 'BBCA.JK', priceToWatch: 5000 }],
    history: ['NVDA', 'AAPL'],
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await updateAccountData(owner.db, uid, (current) => mergeLegacyData(current, legacy));
  }
  const snapshot = await getDocFromServer(doc(owner.db, 'users', uid));
  const { watchlist, history } = snapshot.data();
  assert.equal(watchlist.filter(({ symbol }) => symbol === 'NVDA').length, 1);
  assert.equal(watchlist.find(({ symbol }) => symbol === 'BBCA.JK').priceToWatch, 9000);
  assert.deepEqual(history, ['BBCA.JK', 'NVDA', 'AAPL']);
});

test('a manual edit and a scanner can update categories for one ticker concurrently', async () => {
  await updateAccountData(owner.db, uid, (current) => ({ ...current, watchlist: addSymbol(current.watchlist, 'AAPL', 'consolidation') }));
  await Promise.all([
    updateAccountData(owner.db, uid, (current) => ({
      ...current,
      watchlist: setWatchlistCategories(current.watchlist, 'AAPL', ['consolidation'], ['golden-cross', 'death-cross']),
    })),
    updateAccountData(secondDevice.db, uid, (current) => ({ ...current, watchlist: addSymbol(current.watchlist, 'AAPL', 'falling-wedge') })),
  ]);
  const snapshot = await getDocFromServer(doc(secondDevice.db, 'users', uid));
  assert.deepEqual(snapshot.data().watchlist.filter(({ symbol }) => symbol === 'AAPL'), [{
    symbol: 'AAPL', priceToWatch: null, categories: ['falling-wedge', 'golden-cross', 'death-cross'],
  }]);
});

test('edit harga yang terlambat tidak menghidupkan kembali ticker yang sudah dihapus', async () => {
  await updateAccountData(owner.db, uid, (current) => ({ ...current, watchlist: removeSymbol(current.watchlist, 'AAPL') }));
  await updateAccountData(secondDevice.db, uid, (current) => ({ ...current, watchlist: setPriceToWatch(current.watchlist, 'AAPL', 123) }));
  const snapshot = await getDocFromServer(doc(owner.db, 'users', uid));
  assert.equal(snapshot.data().watchlist.some(({ symbol }) => symbol === 'AAPL'), false);
});

test('logout mencabut akses dan login kembali memulihkan data akun', async () => {
  await signOut(owner.auth);
  await assert.rejects(getDocFromServer(doc(owner.db, 'users', uid)), { code: 'permission-denied' });
  await assert.rejects(signInWithEmailAndPassword(owner.auth, email, 'wrong-password'), (error) => error.code.startsWith('auth/'));
  await signInWithEmailAndPassword(owner.auth, email, password);
  const snapshot = await getDocFromServer(doc(owner.db, 'users', uid));
  assert.equal(snapshot.data().watchlist.find(({ symbol }) => symbol === 'BBCA.JK').priceToWatch, 9000);
});

test('jurnal mempertahankan posisi Long dan Short saat impor dan menyimpan hasil close satu kali', async () => {
  const reference = doc(owner.db, 'users', uid);
  const readJournal = async () => (await getDocFromServer(reference)).data().journal;
  const date = '2026-01-05';
  const position = { date, pair: 'BBCA.JK', setup: 'Breakout', entryPrice: 1000, quoteCurrency: 'IDR', status: 'open' };
  const levels = { stopLoss: 900, rewardMultiple: 3, takeProfit: 1300 };
  await updateAccountData(owner.db, uid, (current) => ({
    ...current,
    journal: addTrade(
      addTrade(current.journal, { ...position, ...levels, id: 'test-long', side: 'long', positionUsd: 500, chartScreenshot: true }),
      { ...position, id: 'test-short', side: 'short' },
    ),
  }));

  await updateAccountData(owner.db, uid, (current) => mergeLegacyData(current, { watchlist: [], history: [] }));
  const open = await readJournal();
  assert.equal(open.length, 2);
  assert.ok(open.every((trade) => trade.status === 'open' && trade.pnl === null));
  const openLong = open.find((trade) => trade.id === 'test-long');
  assert.equal(openLong.positionUsd, 500);
  assert.equal(openLong.chartScreenshot, true);
  assert.deepEqual([openLong.stopLoss, openLong.takeProfit], [levels.stopLoss, levels.takeProfit]);
  assert.equal(openLong.rewardMultiple, levels.rewardMultiple);

  const exitDate = '2026-01-06';
  const close = (id, price) => (current) => ({
    ...current,
    journal: closeTrade(current.journal, id, { price, date: exitDate }),
  });
  await Promise.all([
    updateAccountData(owner.db, uid, close('test-long', 2000)),
    updateAccountData(secondDevice.db, uid, close('test-short', 500)),
  ]);
  await updateAccountData(secondDevice.db, uid, close('test-long', 750));

  const closed = await readJournal();
  const long = closed.find((trade) => trade.id === 'test-long');
  const short = closed.find((trade) => trade.id === 'test-short');
  assert.deepEqual([long.exitPrice, long.exitDate, long.status, long.pnl, long.pnlPct], [2000, exitDate, 'win', 1000, 100]);
  assert.deepEqual([short.exitPrice, short.exitDate, short.status, short.pnl, short.pnlPct], [500, exitDate, 'win', 500, 50]);
  assert.deepEqual([long.stopLoss, long.takeProfit], [levels.stopLoss, levels.takeProfit]);
  assert.equal(long.rewardMultiple, levels.rewardMultiple);
  assert.equal(long.chartScreenshot, true);
  assert.equal(short.chartScreenshot, undefined);
  assert.equal(short.stopLoss, undefined);
  assert.equal(short.rewardMultiple, undefined);
  assert.equal(positionPnlUsd(long), 500);
  assert.equal(positionPnlUsd(short), null);
});

test('dua perangkat memakai saldo wallet yang sama dan penutupan hanya mengembalikan dana sekali', async () => {
  const reference = doc(owner.db, 'users', uid);
  const at = Date.parse('2026-01-07T03:00:00Z');
  await updateAccountData(owner.db, uid, (current) => recordWalletCash(current, { id: 'deposit', kind: 'deposit', cents: 50_000, at }));
  const trade = { date: '2026-01-07', pair: 'NVDA', entryPrice: 100, quoteCurrency: 'USD', status: 'open', positionUsd: 300 };
  const attempts = await Promise.allSettled([
    updateAccountData(owner.db, uid, (current) => openWalletPosition(current, { ...trade, id: 'wallet-a' }, at)),
    updateAccountData(secondDevice.db, uid, (current) => openWalletPosition(current, { ...trade, id: 'wallet-b' }, at)),
  ]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.match(attempts.find(({ status }) => status === 'rejected').reason.message, /Saldo wallet tidak cukup/);

  const opened = (await getDocFromServer(reference)).data();
  const balance = summarizeWallet(opened.wallet);
  assert.deepEqual([balance.availableCents, balance.reservedCents, balance.positions.size], [20_000, 30_000, 1]);
  const [id] = balance.positions.keys();
  const close = (current) => closeWalletPosition(current, id, { date: '2026-01-08', price: 110, currency: 'USD' }, at);
  await Promise.all([updateAccountData(owner.db, uid, close), updateAccountData(secondDevice.db, uid, close)]);
  const settled = (await getDocFromServer(reference)).data();
  assert.equal(summarizeWallet(settled.wallet).availableCents, 53_000);
  assert.deepEqual(settled.wallet.map(({ kind }) => kind), ['deposit', 'open', 'close']);
  assert.equal(settled.journal.find((item) => item.id === id).walletPnlCents, 3000);

  const olderVersion = { ...settled };
  delete olderVersion.wallet;
  await assert.rejects(setDoc(reference, { ...olderVersion, updatedAt: serverTimestamp() }), { code: 'permission-denied' });
  await assert.rejects(setDoc(doc(outsider.db, 'users', uid), { ...settled, updatedAt: serverTimestamp() }), { code: 'permission-denied' });
});

test('pemantau membuka pending setup satu kali dan mempertahankan setup tanpa saldo cukup', { timeout: 45_000 }, async () => {
  const admin = new Firestore({ projectId: 'demo-seticker' });
  const id = crypto.randomUUID();
  const pending = doc(owner.db, journalSetupsCollection, id);
  const unfunded = doc(owner.db, journalSetupsCollection, `${id}-unfunded`);
  const invalid = doc(owner.db, journalSetupsCollection, `${id}-invalid`);
  const reference = doc(owner.db, 'users', uid);
  const setup = {
    uid,
    pair: 'BTC-USD',
    market: 'crypto',
    date: '2026-11-16',
    side: 'long',
    type: 'futures',
    timeframe: '4H',
    setup: 'Support',
    thesis: 'Uji pergerakan harga BTC.',
    positionCents: 10_000,
    limitPrice: 120,
    stopLoss: 114,
    takeProfit: 138,
    rewardMultiple: 3,
    quoteCurrency: 'USD',
    triggerAbove: true,
    entryTimeZone: 'Asia/Jakarta',
    createdAt: serverTimestamp(),
  };
  const before = (await getDocFromServer(reference)).data();
  const available = summarizeWallet(before.wallet).availableCents;
  try {
    for (const changes of [{ type: 'spot', leverage: 10 }, { leverage: 0.5 }, { leverage: '10' }]) {
      await assert.rejects(setDoc(invalid, { ...setup, ...changes }), { code: 'permission-denied' });
    }
    await setDoc(pending, { ...setup, leverage: 10 });
    await setDoc(unfunded, { ...setup, positionCents: available + 1 });
    const owned = query(collection(secondDevice.db, journalSetupsCollection), where('uid', '==', uid));
    assert.equal((await getDocsFromServer(owned)).size, 2);
    const outsiderRef = doc(outsider.db, journalSetupsCollection, id);
    await assert.rejects(getDocFromServer(outsiderRef), { code: 'permission-denied' });
    await assert.rejects(deleteDoc(outsiderRef), { code: 'permission-denied' });
    const foreignSetups = query(collection(outsider.db, journalSetupsCollection), where('uid', '==', uid));
    await assert.rejects(getDocsFromServer(foreignSetups), { code: 'permission-denied' });
    await assert.rejects(setDoc(doc(outsider.db, journalSetupsCollection, `${id}-spoof`), setup), { code: 'permission-denied' });
    await assert.rejects(updateDoc(pending, { positionCents: 1 }), { code: 'permission-denied' });

    const quote = {
      symbol: 'BTC-USD', date: '2026-11-16', currency: 'USD',
      timestamp: Math.ceil(Date.now() / 1000), price: 121,
    };
    const results = await Promise.all([
      monitorJournalSetups(admin, async () => quote),
      monitorJournalSetups(admin, async () => quote),
    ]);
    assert.equal(results.reduce((total, result) => total + result.opened, 0), 1, JSON.stringify(results));
    assert.ok(results.some(({ blocked }) => blocked === 1), JSON.stringify(results));
    assert.ok(results.every(({ failed }) => failed === 0), JSON.stringify(results));

    const after = (await getDocFromServer(reference)).data();
    const trade = after.journal.find((item) => item.id === id);
    assert.deepEqual([trade.status, trade.entryPrice, trade.notes, trade.leverage], ['open', 121, setup.thesis, 10]);
    assert.equal(after.wallet.filter(({ id: movementId }) => movementId === `open:${id}`).length, 1);
    assert.equal(summarizeWallet(after.wallet).availableCents, available - setup.positionCents);
    assert.equal((await admin.doc(pending.path).get()).exists, false);
    assert.equal((await getDocFromServer(unfunded)).exists(), true);

    const exit = { ...quote, price: 133.1, timestamp: quote.timestamp + 60 };
    await updateAccountData(owner.db, uid, (current) => closeWalletPosition(current, id, exit, Date.now()));
    const settled = (await getDocFromServer(reference)).data();
    assert.equal(settled.journal.find((item) => item.id === id).walletPnlCents, 10_000);
    assert.equal(summarizeWallet(settled.wallet).availableCents, available + 10_000);

    await deleteDoc(unfunded);
    assert.equal((await monitorJournalSetups(admin, async () => quote)).opened, 0);
  } finally {
    await admin.getAll(admin.doc(pending.path), admin.doc(unfunded.path), admin.doc(invalid.path)).then((snapshots) =>
      Promise.all(snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.ref.delete())),
    );
    await admin.terminate();
  }
});
