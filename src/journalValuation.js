import { calculateTradePnl, parseJournalLeverage, positionPnlUsd } from './journal.js';
import { parseWalletUsd } from './wallet.js';

export function estimateTradeRisk(form, levels, equityCents) {
  const positionCents = parseWalletUsd(form.positionUsd);
  const leverage = form.type === 'futures' ? parseJournalLeverage(form.leverage, positionCents) : 1;
  const entryPrice = Number(levels.entryPrice);
  const stopPrice = Number(levels.stopLoss);
  const targetPrice = Number(levels.takeProfit);
  const short = form.side === 'short';
  const invalidStop = entryPrice > 0 && stopPrice > 0 && (short ? stopPrice <= entryPrice : stopPrice >= entryPrice);
  const invalidTarget = entryPrice > 0 && targetPrice > 0 && (short ? targetPrice >= entryPrice : targetPrice <= entryPrice);
  const hasPosition = positionCents != null && leverage != null && entryPrice > 0;
  const trade = { entryPrice, side: form.side, type: form.type, positionUsd: positionCents / 100, leverage };

  function valueAt(price) {
    return positionPnlUsd(trade, calculateTradePnl(trade, price).pnlPct);
  }

  const stopPnl = hasPosition && stopPrice > 0 && !invalidStop ? valueAt(stopPrice) : null;
  const targetPnl = hasPosition && targetPrice > 0 && !invalidTarget ? valueAt(targetPrice) : null;
  const loss = Number.isFinite(stopPnl) && stopPnl < 0 ? -stopPnl : null;
  const profit = Number.isFinite(targetPnl) && targetPnl > 0 ? targetPnl : null;
  return {
    loss,
    profit,
    reward: loss != null && profit != null ? profit / loss : null,
    capitalAtRisk: loss != null && equityCents > 0 ? loss / (equityCents / 100) : null,
    invalidStop,
    invalidTarget,
    positionCents,
    leverage,
  };
}

export function summarizeOpenPositions(trades, values) {
  let priced = 0;
  let total = 0;
  let basis = 0;
  let timestamp = null;
  for (const { id, positionUsd } of trades) {
    const value = values.get(id);
    if (Number.isFinite(value?.pnlUsd) && positionUsd > 0) {
      priced += 1;
      total += value.pnlUsd;
      basis += positionUsd;
    }
    const quoteTime = value?.quote?.timestamp;
    if (Number.isFinite(quoteTime) && quoteTime > (timestamp ?? 0) && Number.isFinite(new Date(quoteTime * 1000).getTime())) {
      timestamp = quoteTime;
    }
  }
  return {
    priced,
    total: priced && Number.isFinite(total) ? total : null,
    returnPct: priced === trades.length && basis > 0 && Number.isFinite(total) ? (total / basis) * 100 : null,
    timestamp,
  };
}
