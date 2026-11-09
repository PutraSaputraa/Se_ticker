// Struktur & kalkulasi jurnal trading.
//
// Satu trade (kolom inti):
// { id, date, pair, side, setup, riskPct, pnl, pnlPct, status, notes }
// side: 'long' | 'short'. status: 'win' | 'loss' | 'be' (breakeven).
// pnl: nilai uang dalam currency utama akun. pnlPct: PnL terhadap modal (%).

export const journalStatuses = {
  win: { label: 'Win', className: 'win' },
  loss: { label: 'Loss', className: 'loss' },
  be: { label: 'BE', className: 'be' },
};

export const journalSides = {
  long: { label: 'Long', className: 'long' },
  short: { label: 'Short', className: 'short' },
};

export const journalCurrencies = ['USD', 'IDR', 'USDT'];

let counter = 0;
function makeId() {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTrade(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const pair = typeof entry.pair === 'string' ? entry.pair.trim().toUpperCase() : '';
  if (!pair) return null;

  const side = entry.side === 'short' ? 'short' : 'long';
  const status = journalStatuses[entry.status] ? entry.status : null;
  const num = (value) => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : makeId(),
    date: typeof entry.date === 'string' && entry.date ? entry.date : new Date().toISOString().slice(0, 10),
    pair,
    side,
    setup: typeof entry.setup === 'string' ? entry.setup.trim() : '',
    riskPct: num(entry.riskPct),
    pnl: num(entry.pnl),
    pnlPct: num(entry.pnlPct),
    status,
    notes: typeof entry.notes === 'string' ? entry.notes.trim() : '',
  };
}

export function normalizeJournal(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const trades = [];
  for (const raw of value) {
    const trade = normalizeTrade(raw);
    if (trade && !seen.has(trade.id)) {
      seen.add(trade.id);
      trades.push(trade);
    }
  }
  // Terbaru di atas.
  return trades.sort((a, b) => b.date.localeCompare(a.date));
}

export function addTrade(journal, trade) {
  const normalized = normalizeTrade(trade);
  if (!normalized) return journal;
  return [normalized, ...journal];
}

export function removeTrade(journal, id) {
  return journal.filter((trade) => trade.id !== id);
}

// Statistik ringkas ala Minervini: win rate, avg win/loss, expectancy.
export function summarizeJournal(journal) {
  const closed = journal.filter((trade) => trade.status === 'win' || trade.status === 'loss');
  const wins = closed.filter((trade) => trade.status === 'win');
  const losses = closed.filter((trade) => trade.status === 'loss');
  const sum = (arr, key) => arr.reduce((total, trade) => total + (trade[key] ?? 0), 0);

  const totalPnl = sum(journal, 'pnl');
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
  const avgWin = wins.length ? sum(wins, 'pnl') / wins.length : null;
  const avgLoss = losses.length ? Math.abs(sum(losses, 'pnl')) / losses.length : null;
  const pw = closed.length ? wins.length / closed.length : 0;
  const pl = 1 - pw;
  const expectancyRatio = pl > 0 && avgLoss > 0 && avgWin !== null
    ? (pw * avgWin) / (pl * avgLoss)
    : null;
  const netExpectancy = closed.length && avgWin !== null && avgLoss !== null
    ? (pw * avgWin) - (pl * avgLoss)
    : null;

  return {
    totalTrades: journal.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    be: journal.filter((trade) => trade.status === 'be').length,
    totalPnl: Math.round(totalPnl * 100) / 100,
    winRate: winRate === null ? null : Math.round(winRate * 100) / 100,
    avgWin: avgWin === null ? null : Math.round(avgWin * 100) / 100,
    avgLoss: avgLoss === null ? null : Math.round(avgLoss * 100) / 100,
    expectancyRatio: expectancyRatio === null ? null : Math.round(expectancyRatio * 100) / 100,
    netExpectancy: netExpectancy === null ? null : Math.round(netExpectancy * 100) / 100,
  };
}
