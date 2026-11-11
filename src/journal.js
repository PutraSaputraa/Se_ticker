// Posisi baru menyimpan level harga dan PnL per saham setelah ditutup.
// Catatan lama menyimpan PnL manual dalam mata uang akun.

export const journalStatuses = {
  open: { label: 'Terbuka', className: 'be' },
  win: { label: 'Win', className: 'win' },
  loss: { label: 'Loss', className: 'loss' },
  be: { label: 'BE', className: 'be' },
};

export const journalSides = {
  long: { label: 'Long', className: 'long' },
  short: { label: 'Short', className: 'short' },
};

export const journalCurrencies = ['USD', 'IDR', 'USDT'];
export const journalRewardMultiples = [2, 3, 4];

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
  const num = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const parsed = Number(text.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const entryPrice = num(entry.entryPrice);
  const stopLoss = num(entry.stopLoss);
  const rewardMultiple = num(entry.rewardMultiple);
  const takeProfit = num(entry.takeProfit);
  const positionUsd = num(entry.positionUsd);
  const quoteCurrency = typeof entry.quoteCurrency === 'string' ? entry.quoteCurrency.trim() : '';
  const hasPrice = entryPrice > 0 && Boolean(quoteCurrency);
  const validStatus = Object.hasOwn(journalStatuses, entry.status) && (entry.status !== 'open' || hasPrice);
  const status = validStatus ? entry.status : null;

  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : makeId(),
    date: typeof entry.date === 'string' && entry.date ? entry.date : new Date().toISOString().slice(0, 10),
    pair,
    side,
    setup: typeof entry.setup === 'string' ? entry.setup.trim() : '',
    riskPct: num(entry.riskPct),
    pnl: status === 'open' ? null : num(entry.pnl),
    pnlPct: status === 'open' ? null : num(entry.pnlPct),
    status,
    notes: typeof entry.notes === 'string' ? entry.notes.trim() : '',
    ...(hasPrice && {
      entryPrice,
      ...(stopLoss > 0 && { stopLoss }),
      ...(journalRewardMultiples.includes(rewardMultiple) && { rewardMultiple }),
      ...(takeProfit > 0 && { takeProfit }),
      entryTimestamp: Number.isSafeInteger(entry.entryTimestamp) ? entry.entryTimestamp : null,
      quoteCurrency,
      exitPrice: num(entry.exitPrice),
      exitDate: typeof entry.exitDate === 'string' ? entry.exitDate : null,
      ...(positionUsd > 0 && { positionUsd }),
    }),
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
  if (!normalized || journal.some(({ id }) => id === normalized.id)) return journal;
  return [normalized, ...journal];
}

export function tradeQuoteError(trade, quote) {
  if (quote.currency !== trade.quoteCurrency) {
    return 'Mata uang harga terakhir berbeda dari harga masuk.';
  }
  if (quote.date < trade.date || (trade.entryTimestamp != null && quote.timestamp < trade.entryTimestamp)) {
    return 'Harga terakhir mendahului harga masuk. Coba lagi setelah kuotasi diperbarui.';
  }
  return '';
}

export function calculateTradePnl(trade, price) {
  const pnl = trade.side === 'short' ? trade.entryPrice - price : price - trade.entryPrice;
  return { pnl, pnlPct: (pnl / trade.entryPrice) * 100 };
}

export function closeTrade(journal, id, quote) {
  return journal.map((trade) => {
    if (trade.id !== id || trade.status !== 'open') return trade;
    const result = calculateTradePnl(trade, quote.price);
    return {
      ...trade,
      exitPrice: quote.price,
      exitDate: quote.date,
      ...result,
      status: result.pnl > 0 ? 'win' : result.pnl < 0 ? 'loss' : 'be',
    };
  });
}

export function positionPnlUsd(trade, pnlPct = trade.pnlPct) {
  if (!Number.isFinite(trade.positionUsd) || !Number.isFinite(pnlPct)) return null;
  return trade.positionUsd * (pnlPct / 100);
}

export function summarizeProfitFactors(journal, manualCurrency) {
  const totalsByCurrency = new Map();
  for (const trade of journal) {
    if (trade.status === 'open') continue;

    const currency = trade.quoteCurrency ? 'USD' : manualCurrency;
    const pnl = trade.quoteCurrency ? positionPnlUsd(trade) : trade.pnl;
    if (!Number.isFinite(pnl)) continue;

    const totals = totalsByCurrency.get(currency) ?? { count: 0, grossProfit: 0, grossLoss: 0 };
    totals.count += 1;
    if (pnl > 0) totals.grossProfit += pnl;
    else totals.grossLoss -= pnl;
    totalsByCurrency.set(currency, totals);
  }

  return [...totalsByCurrency]
    .map(([currency, { count, grossProfit, grossLoss }]) => {
      const value = grossLoss > 0
        ? Number((grossProfit / grossLoss).toPrecision(15))
        : (grossProfit > 0 ? Infinity : null);
      return { currency, count, value };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function interpretProfitFactor(value) {
  if (value == null) return 'Belum ada untung atau rugi tercatat';
  if (value === Infinity) return 'Belum ada posisi rugi';
  if (value < 1) return 'Losing system';
  if (value === 1) return 'Break-even sebelum biaya';
  if (value < 1.3) return 'Tipis';
  if (value < 1.5) return 'Lumayan';
  if (value < 2) return 'Bagus';
  if (value <= 3) return 'Sangat bagus';
  return 'Excellent. Cek apakah sampel cukup besar';
}

export function removeTrade(journal, id) {
  return journal.filter((trade) => trade.id !== id);
}

// Statistik ringkas ala Minervini: win rate, avg win/loss, expectancy.
export function summarizeJournal(journal, metric = 'pnl') {
  const closed = journal.filter((trade) => trade.status === 'win' || trade.status === 'loss');
  const wins = closed.filter((trade) => trade.status === 'win');
  const losses = closed.filter((trade) => trade.status === 'loss');
  const sum = (arr, key) => arr.reduce((total, trade) => total + (trade[key] ?? 0), 0);

  const totalPnl = sum(journal, metric);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
  const avgWin = wins.length ? sum(wins, metric) / wins.length : null;
  const avgLoss = losses.length ? Math.abs(sum(losses, metric)) / losses.length : null;
  const pw = closed.length ? wins.length / closed.length : 0;
  const pl = 1 - pw;
  const expectancyRatio = pl > 0 && avgLoss > 0 && avgWin !== null
    ? (pw * avgWin) / (pl * avgLoss)
    : null;
  const netExpectancy = closed.length
    ? (pw * (avgWin ?? 0)) - (pl * (avgLoss ?? 0))
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
