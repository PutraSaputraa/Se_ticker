import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, deleteUser,
  getAuth, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer,
  getDocsFromServer, getFirestore, serverTimestamp, setDoc, terminate,
} from 'firebase/firestore';
import { mergeLegacyData, normalizeAccountData, updateAccountData } from '../src/accountData.js';
import { addTrade, closeTrade, positionPnlUsd } from '../src/journal.js';
import { addSymbol, removeSymbol, setPriceToWatch } from '../src/watchlist.js';

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
  const levels = { stopLoss: 900, takeProfit: 1300 };
  await updateAccountData(owner.db, uid, (current) => ({
    ...current,
    journal: addTrade(
      addTrade(current.journal, { ...position, ...levels, id: 'test-long', side: 'long', positionUsd: 500 }),
      { ...position, id: 'test-short', side: 'short' },
    ),
  }));

  await updateAccountData(owner.db, uid, (current) => mergeLegacyData(current, { watchlist: [], history: [] }));
  const open = await readJournal();
  assert.equal(open.length, 2);
  assert.ok(open.every((trade) => trade.status === 'open' && trade.pnl === null));
  const openLong = open.find((trade) => trade.id === 'test-long');
  assert.equal(openLong.positionUsd, 500);
  assert.deepEqual([openLong.stopLoss, openLong.takeProfit], [levels.stopLoss, levels.takeProfit]);

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
  assert.equal(short.stopLoss, undefined);
  assert.equal(positionPnlUsd(long), 500);
  assert.equal(positionPnlUsd(short), null);
});
