import { getStage2Score } from './stage2Score.js';

export function watchVolumePass(quote) {
  const checks = quote?.buyTrigger?.volumeChecks ?? [];
  if (checks.some((check) => check?.meetsThreshold === true)) return true;
  return checks.length > 0 && checks.every((check) => check?.meetsThreshold === false) ? false : null;
}

export function watchPriceStatus(quote, priceToWatch, volumePass) {
  if (!Number.isFinite(priceToWatch)) return 'none';
  const priceAbove = quote.close > priceToWatch;
  if (priceAbove && volumePass) return 'breakout';
  return priceAbove || volumePass ? 'near' : 'none';
}

export function strongWatchStage2(score) {
  return score?.total === 8 && score.passed >= 7 && Boolean(getStage2Score(score.passed, score.total));
}
