// Deteksi "base breakout" gaya Mark Minervini: harga menembus resistance
// multi-hari setelah konsolidasi ketat, dikonfirmasi volume.
//
// Berbeda dengan Buy Trigger harian (0.4x TrueRange) di sessionLogic.js — ini
// mencari pola chart klasik seperti yang biasa dicari trader (lihat referensi
// breakout resistance + base pada TradingView).

export const defaultBreakoutParams = {
  resistanceDays: 50,      // resistance = high tertinggi N hari (tanpa hari ini)
  tightWindow: 20,         // jendela pengukuran konsolidasi
  tightnessMaxPct: 12,     // konsolidasi "ketat" bila range < 12%
  volumeLookback: 20,      // baseline rata-rata volume
  volumeMinRatio: 1.3,     // volume breakout minimal 1.3x rata-rata
};

function isFiniteBar(bar) {
  return [bar?.open, bar?.high, bar?.low, bar?.close].every(Number.isFinite);
}

// sessions: array {date,open,high,low,close,volume} berurutan lama->baru.
// index: posisi sesi yang diuji (biasanya sesi terakhir yang sudah tutup).
export function analyzeBaseBreakout(sessions, index, params = defaultBreakoutParams) {
  const p = { ...defaultBreakoutParams, ...params };
  const session = sessions[index];
  if (!isFiniteBar(session) || index < 5) {
    return { qualifies: false, reason: 'not-enough-data' };
  }

  // Resistance: high tertinggi selama resistanceDays sebelum hari ini.
  const resStart = Math.max(0, index - p.resistanceDays);
  const base = sessions.slice(resStart, index).filter(isFiniteBar);
  if (base.length < p.resistanceDays * 0.6) {
    return { qualifies: false, reason: 'not-enough-base' };
  }
  const resistance = Math.max(...base.map((bar) => bar.high));

  // Konsolidasi ketat: range harga dalam tightWindow terakhir kecil.
  const tightStart = Math.max(0, index - p.tightWindow);
  const tightBars = sessions.slice(tightStart, index).filter(isFiniteBar);
  let tightPct = null;
  let tight = false;
  if (tightBars.length >= p.tightWindow * 0.5) {
    const tHigh = Math.max(...tightBars.map((bar) => bar.high));
    const tLow = Math.min(...tightBars.map((bar) => bar.low));
    if (tLow > 0) {
      tightPct = ((tHigh - tLow) / tLow) * 100;
      tight = tightPct <= p.tightnessMaxPct;
    }
  }

  // Volume: rata-rata volumeLookback hari sebelum hari ini.
  const volStart = Math.max(0, index - p.volumeLookback);
  const volBars = sessions.slice(volStart, index).filter((bar) => Number.isSafeInteger(bar?.volume));
  let avgVolume = null;
  let volumeRatio = null;
  let volumeOk = null;
  if (volBars.length >= p.volumeLookback * 0.6) {
    avgVolume = volBars.reduce((sum, bar) => sum + bar.volume, 0) / volBars.length;
    if (avgVolume > 0 && Number.isSafeInteger(session.volume)) {
      volumeRatio = session.volume / avgVolume;
      volumeOk = volumeRatio >= p.volumeMinRatio;
    }
  }

  // Breakout: close hari ini menembus resistance base.
  const breaksResistance = Number.isFinite(resistance) && session.close > resistance;
  const breakoutPct = breaksResistance && resistance > 0
    ? ((session.close - resistance) / resistance) * 100
    : null;

  // Wajib: tembus resistance DAN (volume ok bila data volume tersedia).
  const volumeRequirement = volumeOk === null ? true : volumeOk;
  const qualifies = breaksResistance && tight && volumeRequirement;

  return {
    qualifies,
    breaksResistance,
    tight,
    tightPct: tightPct === null ? null : Math.round(tightPct * 100) / 100,
    resistance,
    breakoutPct: breakoutPct === null ? null : Math.round(breakoutPct * 100) / 100,
    avgVolume: avgVolume === null ? null : Math.round(avgVolume),
    volumeRatio: volumeRatio === null ? null : Math.round(volumeRatio * 100) / 100,
    volumeOk,
  };
}
