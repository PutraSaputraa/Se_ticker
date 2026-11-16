export const levelPrecision = 16;
export const journalStopLossPercentages = [5, 6, 7, 8];

const levelPattern = new RegExp(`^\\d*(?:[.,]\\d{1,${levelPrecision}})?$`);

function parseLevelUnits(input) {
  const text = input.trim();
  if (!levelPattern.test(text)) return null;

  const [whole, fraction = ''] = text.split(/[.,]/);
  const units = BigInt(whole + fraction.padEnd(levelPrecision, '0'));
  return units > 0n ? units : null;
}

function formatLevel(units) {
  if (units === null || units <= 0n) return '';
  const digits = String(units).padStart(levelPrecision + 1, '0');
  const whole = digits.slice(0, -levelPrecision);
  const fraction = digits.slice(-levelPrecision).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function calculateLevels(form) {
  const entry = parseLevelUnits(form.entryPrice);
  const direction = form.side === 'long' ? 1n : -1n;
  let stop = parseLevelUnits(form.stopLoss);
  if (form.stopLossPct) {
    const percent = 100n - direction * BigInt(form.stopLossPct);
    // Round to the nearest unit at the form's decimal precision.
    stop = entry === null ? null : (entry * percent + 50n) / 100n;
  }

  let target = parseLevelUnits(form.takeProfit);
  if (form.rewardMultiple) {
    const risk = entry !== null && stop !== null ? (entry - stop) * direction : 0n;
    target = risk > 0n ? entry + direction * risk * BigInt(form.rewardMultiple) : null;
  }

  return { entryPrice: formatLevel(entry), stopLoss: formatLevel(stop), takeProfit: formatLevel(target) };
}

export function validateLevels(levels, { side, rewardMultiple }, entryLabel = 'harga masuk') {
  const entryPrice = Number(levels.entryPrice);
  const stopLoss = Number(levels.stopLoss);
  const takeProfit = Number(levels.takeProfit);
  const prices = rewardMultiple ? [entryPrice, stopLoss] : [entryPrice, stopLoss, takeProfit];
  if (!prices.every((price) => Number.isFinite(price) && price > 0)) {
    throw new Error(`Gunakan angka positif hingga ${levelPrecision} desimal untuk harga yang diisi manual.`);
  }
  if (side === 'long' ? stopLoss >= entryPrice : stopLoss <= entryPrice) {
    throw new Error(side === 'long'
      ? `Untuk Long, Stop Loss harus di bawah ${entryLabel}.`
      : `Untuk Short, Stop Loss harus di atas ${entryLabel}.`);
  }
  if (rewardMultiple && (!Number.isFinite(takeProfit) || takeProfit <= 0)) {
    throw new Error('Take Profit otomatis harus lebih dari 0. Sesuaikan Stop Loss atau Risk Reward Ratio.');
  }
  if (side === 'long' ? takeProfit <= entryPrice : takeProfit >= entryPrice) {
    throw new Error(side === 'long'
      ? `Untuk Long, Take Profit harus di atas ${entryLabel}.`
      : `Untuk Short, Take Profit harus di bawah ${entryLabel}.`);
  }
  return { entryPrice, stopLoss, takeProfit };
}
