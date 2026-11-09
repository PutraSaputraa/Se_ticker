// Mesin analisis gaya Mark Minervini: Trend Template (Stage 2), VCP, dan Pivot.
//
// Catatan implementasi (sesuai bedah buku oleh user):
// - Trend Template: 8 aturan numerik dari Trade Like a Stock Market Wizard.
// - RS Rating: bukan replika IBD, melainkan persentil return 12 bulan antar
//   saham dalam universe (pendekatan buatan kita).
// - VCP: deteksi kontraksi yang makin dangkal + Volume Dry-Up (VDU). Ini
//   heuristik kuantitatif, bukan jaminan pola persis seperti di chart.
// - Pivot: high kontraksi terakhir; extension mengukur jarak harga dari pivot.

export const minerviniDefaults = {
  smaFast: 50,
  smaMid: 150,
  smaSlow: 200,
  slowRiseDays: 20,          // MA200 naik minimal ~1 bulan
  low52Lookback: 252,
  high52Lookback: 252,
  minAboveLow52Pct: 30,      // aturan 6: >= 30% di atas low 52w
  maxBelowHigh52Pct: 25,     // aturan 7: <= 25% di bawah high 52w
  rsMinRating: 70,           // aturan 8: RS >= 70
  rsLookback: 252,           // return 12 bulan
  // VCP
  vcpMaxContractions: 6,
  vcpMinContractions: 2,
  vduStrong: 0.5,            // VDU <= 0.5 kuat
  vduOk: 0.7,                // VDU <= 0.7 menarik
  // Pivot / extension
  extensionMaxPct: 5,        // batas chasing (bisa diubah user nanti)
  volumeLookback: 50,
  rvolMin: 1.5,              // konfirmasi volume breakout
};

function sma(values, end, period) {
  const start = end - period + 1;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i <= end; i += 1) {
    if (!Number.isFinite(values[i])) return null;
    sum += values[i];
  }
  return sum / period;
}

function highestHigh(sessions, end, lookback) {
  const start = Math.max(0, end - lookback + 1);
  let max = -Infinity;
  for (let i = start; i <= end; i += 1) {
    if (Number.isFinite(sessions[i]?.high)) max = Math.max(max, sessions[i].high);
  }
  return max === -Infinity ? null : max;
}

function lowestLow(sessions, end, lookback) {
  const start = Math.max(0, end - lookback + 1);
  let min = Infinity;
  for (let i = start; i <= end; i += 1) {
    if (Number.isFinite(sessions[i]?.low)) min = Math.min(min, sessions[i].low);
  }
  return min === Infinity ? null : min;
}

// ---------------------------------------------------------------------------
// Trend Template — 8 aturan Stage 2.
// sessions: array {date,open,high,low,close,volume} lama->baru; index = sesi uji.
// rsRating: persentil return 12 bulan (0-100) dari universe, atau null.
// ---------------------------------------------------------------------------

export function evaluateTrendTemplate(sessions, index, rsRating = null, params = minerviniDefaults) {
  const p = { ...minerviniDefaults, ...params };
  const closes = sessions.map((s) => s?.close);
  const close = closes[index];
  if (!Number.isFinite(close)) {
    return { passed: 0, total: 8, eligible: false, rules: [] };
  }

  const ma50 = sma(closes, index, p.smaFast);
  const ma150 = sma(closes, index, p.smaMid);
  const ma200 = sma(closes, index, p.smaSlow);
  const ma200Prev = sma(closes, index - p.slowRiseDays, p.smaSlow);
  const high52 = highestHigh(sessions, index, p.high52Lookback);
  const low52 = lowestLow(sessions, index, p.low52Lookback);

  const aboveLow52Pct = Number.isFinite(low52) && low52 > 0 ? (close / low52 - 1) * 100 : null;
  const belowHigh52Pct = Number.isFinite(high52) && high52 > 0 ? (1 - close / high52) * 100 : null;

  const rules = [
    {
      key: 'above-ma150-200',
      label: 'Harga di atas MA150 & MA200',
      passed: Number.isFinite(ma150) && Number.isFinite(ma200) && close > ma150 && close > ma200,
      value: close, ref: { ma150, ma200 },
    },
    {
      key: 'ma150-above-ma200',
      label: 'MA150 di atas MA200',
      passed: Number.isFinite(ma150) && Number.isFinite(ma200) && ma150 > ma200,
      value: ma150, ref: { ma200 },
    },
    {
      key: 'ma200-rising',
      label: `MA200 naik ≥${p.slowRiseDays} hari`,
      passed: Number.isFinite(ma200) && Number.isFinite(ma200Prev) && ma200 > ma200Prev,
      value: ma200, ref: { ma200Prev },
    },
    {
      key: 'ma50-above',
      label: 'MA50 di atas MA150 & MA200',
      passed: Number.isFinite(ma50) && Number.isFinite(ma150) && Number.isFinite(ma200) && ma50 > ma150 && ma50 > ma200,
      value: ma50, ref: { ma150, ma200 },
    },
    {
      key: 'above-ma50',
      label: 'Harga di atas MA50',
      passed: Number.isFinite(ma50) && close > ma50,
      value: close, ref: { ma50 },
    },
    {
      key: 'above-low52',
      label: `≥${p.minAboveLow52Pct}% di atas low 52w`,
      passed: aboveLow52Pct !== null && aboveLow52Pct >= p.minAboveLow52Pct,
      value: aboveLow52Pct, ref: { low52 },
    },
    {
      key: 'below-high52',
      label: `≤${p.maxBelowHigh52Pct}% di bawah high 52w`,
      passed: belowHigh52Pct !== null && belowHigh52Pct <= p.maxBelowHigh52Pct,
      value: belowHigh52Pct, ref: { high52 },
    },
    {
      key: 'rs-rating',
      label: `RS Rating ≥${p.rsMinRating}`,
      passed: Number.isFinite(rsRating) && rsRating >= p.rsMinRating,
      value: rsRating, ref: { min: p.rsMinRating },
    },
  ];

  const passed = rules.filter((rule) => rule.passed).length;
  return {
    passed,
    total: rules.length,
    eligible: passed === rules.length,
    rules,
    values: {
      close, ma50, ma150, ma200, high52, low52, aboveLow52Pct, belowHigh52Pct, rsRating,
    },
  };
}

// ---------------------------------------------------------------------------
// VCP — deteksi kontraksi yang makin dangkal + Volume Dry-Up.
// Menggunakan swing high/low sederhana berbasis zig-zag persentase.
// ---------------------------------------------------------------------------

function findSwings(sessions, endIndex, lookback, zigPct = 4) {
  const start = Math.max(0, endIndex - lookback + 1);
  const bars = sessions.slice(start, endIndex + 1);
  const swings = [];
  let trend = 0; // 1 up, -1 down
  let extreme = bars[0];
  let extremeIdx = 0;

  bars.forEach((bar, i) => {
    if (!Number.isFinite(bar?.high) || !Number.isFinite(bar?.low)) return;
    if (trend >= 0 && bar.high > extreme.high) { extreme = bar; extremeIdx = i; }
    if (trend <= 0 && bar.low < extreme.low) { extreme = bar; extremeIdx = i; }

    if (trend !== -1) {
      const drop = (extreme.high - bar.low) / extreme.high * 100;
      if (drop >= zigPct) {
        swings.push({ type: 'high', idx: start + extremeIdx, price: extreme.high, date: extreme.date });
        trend = -1;
        extreme = bar; extremeIdx = i;
      }
    } else {
      const rise = (bar.high - extreme.low) / extreme.low * 100;
      if (rise >= zigPct) {
        swings.push({ type: 'low', idx: start + extremeIdx, price: extreme.low, date: extreme.date });
        trend = 1;
        extreme = bar; extremeIdx = i;
      }
    }
  });

  // Tambahkan ekstrem terakhir sebagai swing sementara.
  swings.push({
    type: trend === 1 ? 'high' : 'low',
    idx: start + extremeIdx,
    price: trend === 1 ? extreme.high : extreme.low,
    date: extreme.date,
  });
  return swings;
}

export function analyzeVCP(sessions, index, params = minerviniDefaults) {
  const p = { ...minerviniDefaults, ...params };
  const swings = findSwings(sessions, index, 120);

  // Pasangkan high->low untuk dapat kedalaman tiap kontraksi.
  const contractions = [];
  for (let i = 0; i < swings.length - 1; i += 1) {
    const high = swings[i];
    const low = swings[i + 1];
    if (high.type === 'high' && low.type === 'low' && low.idx > high.idx && high.price > 0) {
      const depth = ((high.price - low.price) / high.price) * 100;
      contractions.push({ highIdx: high.idx, lowIdx: low.idx, highPrice: high.price, lowPrice: low.price, depth });
    }
  }

  const recent = contractions.slice(-p.vcpMaxContractions);
  const depths = recent.map((c) => Math.round(c.depth * 100) / 100);
  const shrinking = depths.length >= p.vcpMinContractions
    && depths.every((depth, i) => i === 0 || depth <= depths[i - 1] * 1.05); // toleransi 5%

  // Volume Dry-Up: rata-rata volume 5 hari vs 50 hari menjelang index.
  const avgVol = (from, to) => {
    const vols = sessions.slice(Math.max(0, from), to + 1)
      .map((s) => s?.volume)
      .filter(Number.isSafeInteger);
    return vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  };
  const avgVol50 = avgVol(index - p.volumeLookback, index - 1);
  const avgVol5 = avgVol(index - 5, index - 1);
  const vdu = Number.isFinite(avgVol50) && avgVol50 > 0 && Number.isFinite(avgVol5)
    ? avgVol5 / avgVol50
    : null;

  const contractionCount = depths.length;
  const valid = shrinking && contractionCount >= p.vcpMinContractions && contractionCount <= p.vcpMaxContractions;

  return {
    forming: valid,
    contractionCount,
    depths,
    ratios: depths.map((depth, i) => (i === 0 ? null : Math.round((depth / depths[i - 1]) * 100) / 100)),
    vdu: vdu === null ? null : Math.round(vdu * 100) / 100,
    vduStrong: vdu !== null && vdu <= p.vduStrong,
    vduOk: vdu !== null && vdu <= p.vduOk,
    lastContraction: recent.at(-1) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Pivot — high kontraksi terakhir sebagai level pemicu entry.
// ---------------------------------------------------------------------------

export function analyzePivot(sessions, index, vcp, params = minerviniDefaults) {
  const p = { ...minerviniDefaults, ...params };
  const close = sessions[index]?.close;
  if (!Number.isFinite(close)) {
    return { pivot: null, breakout: false, extension: null, rvol: null, chaseOk: null };
  }

  // Pivot = high kontraksi terakhir bila ada VCP; kalau tidak, high base 50 hari.
  let pivot = vcp?.lastContraction?.highPrice ?? null;
  if (!Number.isFinite(pivot)) {
    pivot = highestHigh(sessions, index - 1, 50);
  }

  // RVOL: volume hari ini vs rata-rata 50 hari.
  const vols = sessions.slice(Math.max(0, index - p.volumeLookback), index)
    .map((s) => s?.volume)
    .filter(Number.isSafeInteger);
  const avgVol50 = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  const todayVol = sessions[index]?.volume;
  const rvol = Number.isSafeInteger(todayVol) && Number.isFinite(avgVol50) && avgVol50 > 0
    ? todayVol / avgVol50
    : null;

  const breakout = Number.isFinite(pivot) && close > pivot;
  const extension = Number.isFinite(pivot) && pivot > 0 ? ((close / pivot) - 1) * 100 : null;
  const chaseOk = extension === null ? null : extension <= p.extensionMaxPct;

  return {
    pivot: pivot === null ? null : Math.round(pivot * 100) / 100,
    breakout,
    extension: extension === null ? null : Math.round(extension * 100) / 100,
    rvol: rvol === null ? null : Math.round(rvol * 100) / 100,
    rvolOk: rvol !== null && rvol >= p.rvolMin,
    chaseOk,
  };
}

// Gabungan: status operasional saham.
export function summarizeStatus(trend, vcp, pivot) {
  if (!trend.eligible) return 'NOT_ELIGIBLE';
  if (pivot.breakout && pivot.rvolOk) return 'BREAKOUT_TRIGGERED';
  if (pivot.breakout) return 'BREAKOUT_LOW_VOLUME';
  if (vcp.forming && pivot.extension !== null && Math.abs(pivot.extension) <= 3) return 'PIVOT_READY';
  if (vcp.forming) return 'VCP_FORMING';
  return 'WATCHLIST';
}
