import { AccountChangeError } from './accountData.js';
import { addTrade, closeTrade, positionPnlUsd, removeTrade, tradeQuoteError } from './journal.js';

export const walletMovementLabels = {
  deposit: 'Tambah saldo',
  withdraw: 'Tarik saldo',
  open: 'Buka posisi',
  close: 'Tutup posisi',
  cancel: 'Batal posisi',
};

const centsFormat = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseWalletUsd(value) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function summarizeWallet(wallet = []) {
  const history = [];
  const positions = new Map();
  let availableCents = 0;
  let reservedCents = 0;

  for (const movement of wallet) {
    if (!movement || !Object.hasOwn(walletMovementLabels, movement.kind) || typeof movement.id !== 'string'
      || !Number.isFinite(new Date(movement.at).getTime()) || !Number.isSafeInteger(movement.at)
      || !Number.isSafeInteger(movement.cashDelta) || !Number.isSafeInteger(movement.reservedDelta)) continue;
    availableCents += movement.cashDelta;
    reservedCents += movement.reservedDelta;
    if (movement.kind === 'open') positions.set(movement.tradeId, movement.reservedDelta);
    if (movement.kind === 'close' || movement.kind === 'cancel') positions.delete(movement.tradeId);
    history.push({ ...movement, availableCents, reservedCents, equityCents: availableCents + reservedCents });
  }
  return { availableCents, reservedCents, equityCents: availableCents + reservedCents, positions, history };
}

function appendMovement(account, state, movement) {
  const available = state.availableCents + movement.cashDelta;
  const reserved = state.reservedCents + movement.reservedDelta;
  if (![movement.cashDelta, movement.reservedDelta, available, reserved, available + reserved].every(Number.isSafeInteger) || reserved < 0) {
    throw new AccountChangeError('Nilai transaksi melampaui batas saldo yang bisa dicatat.');
  }
  const at = Math.max(movement.at, (state.history.at(-1)?.at ?? 0) + 1);
  return { ...account, wallet: [...(account.wallet ?? []), { ...movement, at }] };
}

export function recordWalletCash(account, { id, kind, cents, at }) {
  if (!Number.isSafeInteger(cents) || cents <= 0 || !['deposit', 'withdraw'].includes(kind)) {
    throw new AccountChangeError('Isi jumlah USD lebih dari nol dengan maksimal dua desimal.');
  }
  if (account.wallet?.some((movement) => movement?.id === id)) return account;
  const state = summarizeWallet(account.wallet);
  if (kind === 'withdraw' && cents > state.availableCents) {
    throw new AccountChangeError('Saldo wallet tidak cukup untuk penarikan ini.');
  }
  const cashDelta = kind === 'deposit' ? cents : -cents;
  return appendMovement(account, state, { id, kind, at, cashDelta, reservedDelta: 0 });
}

export function openWalletPosition(account, trade, at) {
  const journal = addTrade(account.journal, trade);
  if (journal === account.journal) return account;

  const [position] = journal;
  const movementId = `open:${position.id}`;
  if (account.wallet?.some((movement) => movement?.id === movementId)) return account;
  const principal = parseWalletUsd(String(position.positionUsd ?? ''));
  if (position.status !== 'open' || principal == null) {
    throw new AccountChangeError('Isi nilai posisi USD lebih dari nol dengan maksimal dua desimal.');
  }
  const state = summarizeWallet(account.wallet);
  if (principal > state.availableCents) {
    throw new AccountChangeError('Saldo wallet tidak cukup untuk nilai posisi ini.');
  }
  return appendMovement({ ...account, journal }, state, {
    id: movementId, kind: 'open', at, tradeId: position.id, symbol: position.pair,
    cashDelta: -principal, reservedDelta: principal,
  });
}

export function closeWalletPosition(account, id, quote, at) {
  const trade = account.journal.find((item) => item.id === id && item.status === 'open');
  if (!trade) return account;
  const error = tradeQuoteError(trade, quote);
  if (error) throw new AccountChangeError(error);

  let journal = closeTrade(account.journal, id, quote);
  const state = summarizeWallet(account.wallet);
  const principal = state.positions.get(id);
  if (principal == null) return { ...account, journal };

  const pnl = positionPnlUsd(journal.find((item) => item.id === id));
  if (!Number.isFinite(pnl)) throw new AccountChangeError('PnL posisi belum bisa dihitung.');
  const pnlCents = Number(centsFormat.format(pnl).replace('.', '')) || 0;
  journal = journal.map((item) => item.id === id ? { ...item, walletPnlCents: pnlCents } : item);
  return appendMovement({ ...account, journal }, state, {
    id: `close:${id}`, kind: 'close', at, tradeId: id, symbol: trade.pair,
    cashDelta: principal + pnlCents, reservedDelta: -principal,
  });
}

export function removeWalletPosition(account, id, at) {
  const trade = account.journal.find((item) => item.id === id);
  if (!trade) return account;
  const journal = removeTrade(account.journal, id);
  const state = summarizeWallet(account.wallet);
  const principal = state.positions.get(id);
  if (trade.status !== 'open' || principal == null) return { ...account, journal };

  return appendMovement({ ...account, journal }, state, {
    id: `cancel:${id}`, kind: 'cancel', at, tradeId: id, symbol: trade.pair,
    cashDelta: principal, reservedDelta: -principal,
  });
}
