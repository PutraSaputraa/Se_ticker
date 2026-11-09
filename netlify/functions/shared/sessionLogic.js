// Logika baca sesi dan hitung Buy Trigger, dipakai bersama oleh price.js dan
// breakout-scan.js. Tidak ada dependensi Netlify di sini — murni kalkulasi.

export const dayMilliseconds = 86_400_000;
export const volumeLookback = 50;
export const chartLookback = 20;

export function readSessions(timestamps, quote, marketDate) {
  const sessions = new Map();

  for (const [index, timestamp] of timestamps.entries()) {
    if (!Number.isFinite(timestamp)) continue;
    const date = marketDate.format(timestamp * 1000);

    // Yahoo dapat menambahkan snapshot pada tanggal yang sudah punya bar harian.
    if (sessions.has(date)) continue;
    const volume = quote.volume?.[index];
    sessions.set(date, {
      date,
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: Number.isSafeInteger(volume) && volume >= 0 ? volume : null,
    });
  }

  return [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestCompletedIndex(sessions, meta, marketDate) {
  const now = Date.now();
  const today = marketDate.format(now);
  const regularEnd = meta?.currentTradingPeriod?.regular?.end;
  const lastTrade = meta?.regularMarketTime;

  // Jadwal tutup dan waktu kuotasi harus mencakup akhir sesi hari ini.
  const todayClosed = Number.isFinite(regularEnd)
    && Number.isFinite(lastTrade)
    && now >= regularEnd * 1000
    && lastTrade >= regularEnd
    && marketDate.format(regularEnd * 1000) === today;

  return sessions.findLastIndex(({ date }) => date < today || (todayClosed && date === today));
}

export function calculateBuyTrigger(sessions, index) {
  const session = sessions[index];
  const previous = sessions[index - 1];
  const previousClose = Number.isFinite(previous?.close) ? previous.close : null;
  const trueRange = previousClose === null
    ? null
    : Math.max(
      session.high - session.low,
      Math.abs(session.high - previousClose),
      Math.abs(session.low - previousClose),
    );
  const triggerDistance = trueRange === null ? null : 0.4 * trueRange;

  // Ambil 50 sesi yang mendahului kedua sesi yang diuji.
  const baselineEnd = index - 1;
  const baselineStart = baselineEnd - volumeLookback;
  const baseline = baselineStart >= 0 ? sessions.slice(baselineStart, baselineEnd) : [];
  const volumeSum = baseline.length === volumeLookback && baseline.every(({ volume }) => volume !== null)
    ? baseline.reduce((sum, { volume }) => sum + volume, 0)
    : null;
  const averageVolume = volumeSum === null ? null : volumeSum / volumeLookback;
  // Gunakan 14/10 agar ambang minimum lembar tidak bergeser karena pembulatan 1,4.
  const minimumVolume = volumeSum === null ? null : Math.ceil(volumeSum * 14 / (volumeLookback * 10));

  return {
    trueRange,
    level: triggerDistance === null ? null : session.close + triggerDistance,
    sellLevel: triggerDistance === null ? null : session.close - triggerDistance,
    previousClose,
    averageVolume,
    minimumVolume,
    volumeChecks: [session, previous].map((day) => {
      const volume = day?.volume ?? null;
      return {
        date: day?.date ?? null,
        volume,
        meetsThreshold: volume === null || minimumVolume === null ? null : volume >= minimumVolume,
      };
    }),
  };
}
