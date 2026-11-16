import { FieldPath, FieldValue, Firestore } from '@google-cloud/firestore';
import { normalizeAccountData } from '../../src/accountData.js';
import { journalSetupsCollection, tradeFromTriggeredSetup } from '../../src/journalSetups.js';
import { openWalletPosition, summarizeWallet } from '../../src/wallet.js';
import price from './price.js';

const pageSize = 16;
const quoteConcurrency = 8;
let firestore;

function monitorDatabase() {
  if (firestore) return firestore;
  if (process.env.NETLIFY_DEV === 'true' && process.env.FIRESTORE_EMULATOR_HOST) {
    firestore = new Firestore({ projectId: 'demo-seticker' });
    return firestore;
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  let key;
  try {
    key = JSON.parse(process.env.JOURNAL_FIRESTORE_CREDENTIALS ?? 'null');
  } catch {
    throw new Error('JOURNAL_FIRESTORE_CREDENTIALS harus berupa JSON service account.');
  }
  if (!projectId || key?.project_id !== projectId || !key.client_email || !key.private_key) {
    throw new Error('Service account Firestore untuk pemantau Jurnal belum dikonfigurasi.');
  }

  firestore = new Firestore({
    projectId,
    credentials: { client_email: key.client_email, private_key: key.private_key },
  });
  return firestore;
}

async function latestQuote(pair) {
  const params = new URLSearchParams({ mode: 'journal', symbol: pair });
  const response = await price(new Request(`https://localhost/price?${params}`));
  return response.ok ? response.json() : null;
}

async function activateSetups(db, uid, items, quotes) {
  const accountRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const [snapshot, ...setups] = await transaction.getAll(accountRef, ...items.map((item) => item.ref));
    let account = normalizeAccountData(snapshot.data());
    let opened = 0;
    let blocked = 0;
    const existing = setups.filter((item) => item.exists)
      .sort((a, b) => a.get('createdAt').toMillis() - b.get('createdAt').toMillis());

    for (const item of existing) {
      const setup = item.data();
      if (setup.uid !== uid) continue;
      const quote = quotes.get(setup.pair);
      const trade = tradeFromTriggeredSetup({ ...setup, id: item.id }, quote);
      if (!trade) continue;
      if (account.journal.some(({ id }) => id === item.id)) {
        transaction.delete(item.ref);
        continue;
      }
      if (summarizeWallet(account.wallet).availableCents < setup.positionCents) {
        blocked += 1;
        continue;
      }
      const updated = openWalletPosition(account, trade, Date.now());
      transaction.delete(item.ref);
      if (updated !== account) {
        account = updated;
        opened += 1;
      }
    }

    if (opened > 0) {
      transaction.set(accountRef, {
        journal: account.journal,
        wallet: account.wallet,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { opened, blocked };
  });
}

export async function monitorJournalSetups(db, getQuote = latestQuote) {
  const cursorRef = db.collection('journalSetupMonitor').doc('cursor');
  const cursor = (await cursorRef.get()).data()?.after ?? null;
  const queue = db.collection(journalSetupsCollection).orderBy(FieldPath.documentId()).limit(pageSize);
  let batch = await (cursor ? queue.startAfter(cursor) : queue).get();
  if (batch.empty && cursor) batch = await queue.get();

  const pairs = [...new Set(batch.docs.map((item) => item.get('pair')))];
  const quotes = new Map();
  for (let index = 0; index < pairs.length; index += quoteConcurrency) {
    const window = pairs.slice(index, index + quoteConcurrency);
    const results = await Promise.allSettled(window.map((pair) => getQuote(pair)));
    results.forEach((result, offset) => {
      if (result.status === 'fulfilled' && result.value) quotes.set(window[offset], result.value);
    });
  }

  const byUser = new Map();
  for (const item of batch.docs) {
    const data = item.data();
    if (!tradeFromTriggeredSetup({ ...data, id: item.id }, quotes.get(data.pair))) continue;
    const candidates = byUser.get(data.uid) ?? [];
    candidates.push(item);
    byUser.set(data.uid, candidates);
  }
  const results = await Promise.allSettled([...byUser].map(([uid, items]) => activateSetups(db, uid, items, quotes)));
  const after = batch.size === pageSize ? batch.docs.at(-1).id : null;
  if (after !== cursor) await cursorRef.set({ after });

  const summary = {
    checked: batch.size,
    quotesUnavailable: pairs.length - quotes.size,
    opened: 0,
    blocked: 0,
    failed: results.filter(({ status }) => status === 'rejected').length,
  };
  for (const result of results) {
    if (result.status === 'fulfilled') {
      summary.opened += result.value.opened;
      summary.blocked += result.value.blocked;
    }
  }
  return summary;
}

export default async function journalSetupMonitor() {
  try {
    const result = await monitorJournalSetups(monitorDatabase());
    if (result.checked > 0) console.info('Pemantauan setup Jurnal selesai.', result);
    return new Response(null, { status: result.failed ? 503 : 204 });
  } catch (error) {
    console.error('Pemantau setup Jurnal gagal.', error.code ?? error.message);
    return new Response(null, { status: 503 });
  }
}

export const config = { schedule: '* * * * *' };
