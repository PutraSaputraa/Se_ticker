import { normalizeTrade, quoteDateForTrade } from './journal.js';

export const journalSetupsCollection = 'journalSetups';

export const journalSetupMarkets = {
  us: 'US',
  hk: 'HK',
  jp: 'JP',
  ks: 'KR (KOSPI)',
  kq: 'KR (KOSDAQ)',
  tw: 'TW (TWSE)',
  two: 'TW (TPEx)',
  crypto: 'Crypto',
  id: 'ID',
  ss: 'CN (Shanghai)',
  sz: 'CN (Shenzhen)',
};

export const journalSetupTimeframes = ['Daily', 'Weekly', '4H'];

export function tradeFromTriggeredSetup(setup, quote) {
  const createdAt = setup.createdAt?.toMillis?.();
  if (!Number.isFinite(createdAt) || !quote || !Number.isSafeInteger(quote.timestamp)
    || quote.timestamp * 1000 < createdAt || quote.symbol !== setup.pair
    || quote.currency !== setup.quoteCurrency || !Number.isFinite(quote.price) || quote.price <= 0
    || !quote.date) return null;

  const reached = setup.triggerAbove ? quote.price >= setup.limitPrice : quote.price <= setup.limitPrice;
  if (!reached) return null;

  return normalizeTrade({
    id: setup.id,
    status: 'open',
    date: quoteDateForTrade(setup, quote),
    pair: setup.pair,
    side: setup.side,
    type: setup.type,
    setup: setup.setup,
    notes: setup.thesis,
    positionUsd: setup.positionCents / 100,
    entryPrice: quote.price,
    entryTimestamp: quote.timestamp,
    entryTimeZone: setup.entryTimeZone,
    quoteCurrency: quote.currency,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    rewardMultiple: setup.rewardMultiple,
    setupPlan: {
      date: setup.date,
      market: setup.market,
      timeframe: setup.timeframe,
      limitPrice: setup.limitPrice,
    },
  });
}
