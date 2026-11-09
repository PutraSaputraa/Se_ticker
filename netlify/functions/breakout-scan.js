import {
  calculateBuyTrigger,
  latestCompletedIndex,
  readSessions,
} from './shared/sessionLogic.js';
import { getUniverse } from './shared/universe.js';

const fetchConcurrency = 4;
const fetchTimeoutMs = 8_000;
// Model free Kenari adalah reasoning model dan bisa lambat (belasan detik),
// jadi beri batas waktu yang longgar agar tidak keburu di-abort.
const aiTimeoutMs = 90_000;
const maxScanResults = 10;

const noKeyError = 'Kunci API Kenari belum dikonfigurasi di server.';
const scanError = 'Pemindaian breakout gagal. Coba lagi nanti.';
const aiUnavailable = 'Ringkasan AI belum tersedia saat ini.';

// ---------------------------------------------------------------------------
// Fetch satu simbol ke Yahoo Finance dan evaluasi kondisi breakout-nya.
// ---------------------------------------------------------------------------

async function evaluateSymbol(code, marketDate) {
  const symbol = `${code}.JK`;
  const query = new URLSearchParams({ range: '6mo', interval: '1d' });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];
    if (!Array.isArray(timestamps) || timestamps.length === 0 || !quote) return null;

    const sessions = readSessions(timestamps, quote, marketDate);
    const index = latestCompletedIndex(sessions, result.meta, marketDate);
    if (index < 1) return null;

    const session = sessions[index];
    if (![session.open, session.high, session.low, session.close].every(Number.isFinite)) {
      return null;
    }

    const trigger = calculateBuyTrigger(sessions, index);
    const { level, volumeChecks, averageVolume } = trigger;
    const volumeOk = volumeChecks.some((check) => check?.meetsThreshold === true);
    const priceAbove = Number.isFinite(level) ? session.close > level : false;

    const changePct = Number.isFinite(trigger.previousClose) && trigger.previousClose > 0
      ? ((session.close - trigger.previousClose) / trigger.previousClose) * 100
      : null;
    const volumeRatio = Number.isFinite(averageVolume) && averageVolume > 0 && session.volume !== null
      ? session.volume / averageVolume
      : null;
    const name = [result.meta?.longName, result.meta?.shortName].find(
      (value) => typeof value === 'string' && value.trim(),
    );

    // Jarak harga ke level trigger (negatif = masih di bawah), untuk mode demo.
    const distance = Number.isFinite(level) && level > 0
      ? (session.close - level) / level
      : -Infinity;

    return {
      symbol,
      name: name ?? null,
      date: session.date,
      close: session.close,
      changePct: changePct === null ? null : Math.round(changePct * 100) / 100,
      volume: session.volume,
      volumeRatio: volumeRatio === null ? null : Math.round(volumeRatio * 100) / 100,
      triggerLevel: Number.isFinite(level) ? level : null,
      currency: typeof result.meta?.currency === 'string' ? result.meta.currency : 'IDR',
      breakout: priceAbove && volumeOk,
      priceAbove,
      volumeOk,
      distance,
    };
  } catch {
    return null;
  }
}

// Batasi paralelisme agar tidak memicu rate limit Yahoo.
// Mode 'demo' mengabaikan syarat breakout dan mengambil kandidat terdekat —
// hanya untuk melihat tampilan UI + AI, bukan sinyal sungguhan.
async function scanUniverse(codes, marketDate, mode = 'strict') {
  const evaluated = [];
  let cursor = 0;

  async function worker() {
    while (cursor < codes.length) {
      const code = codes[cursor];
      cursor += 1;
      const result = await evaluateSymbol(code, marketDate);
      if (result) evaluated.push(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(fetchConcurrency, codes.length) }, worker));

  if (mode === 'demo') {
    return evaluated
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 5)
      .map(({ breakout, priceAbove, volumeOk, distance, ...pick }) => pick);
  }

  return evaluated
    .filter((pick) => pick.breakout)
    .sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0))
    .slice(0, maxScanResults)
    .map(({ breakout, priceAbove, volumeOk, distance, ...pick }) => pick);
}

// ---------------------------------------------------------------------------
// Ringkasan via Kenari.id (gateway OpenAI-compatible).
// ---------------------------------------------------------------------------

function formatIdr(price) {
  return Number.isFinite(price) ? `Rp${price.toLocaleString('id-ID')}` : '-';
}

function buildPrompt(picks, referenceDate, universeName) {
  const lines = picks.map((pick, index) => [
    `${index + 1}. ${pick.symbol}${pick.name ? ` (${pick.name})` : ''}`,
    `close ${formatIdr(pick.close)}`,
    pick.changePct === null ? null : `perubahan ${pick.changePct >= 0 ? '+' : ''}${pick.changePct}%`,
    pick.volumeRatio === null ? null : `volume ${pick.volumeRatio}x rata-rata`,
    pick.triggerLevel === null ? null : `menembus level ${formatIdr(pick.triggerLevel)}`,
  ].filter(Boolean).join(', '));

  return [
    `Berikut saham Indonesia (indeks ${universeName}) yang terdeteksi breakout pada sesi ${referenceDate},`,
    'diurutkan dari rasio volume tertinggi:',
    '',
    ...lines,
    '',
    'Tugasmu:',
    '1. Tulis ringkasan 2-3 kalimat dalam Bahasa Indonesia yang menyebut saham paling layak dipantau dan alasannya.',
    '2. Untuk setiap saham, tulis SATU kalimat alasan singkat (maksimal 15 kata) kenapa menarik dipantau.',
    '3. Bahasa santai tapi informatif, tanpa saran finansial ("dyor", "bukan rekomendasi", dll. tidak perlu).',
    '',
    'Jawab HANYA dengan JSON valid persis berbentuk:',
    '{"summary":"...","notes":[{"symbol":"XXXX","note":"..."}]}',
  ].join('\n');
}

async function summarizeWithKenari(picks, referenceDate, universeName) {
  const apiKey = process.env.KENARI_API_KEY?.trim();
  if (!apiKey) return { summary: '', error: noKeyError, configured: false };

  try {
    const response = await fetch('https://kenari.id/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'kenari-free',
        messages: [{ role: 'user', content: buildPrompt(picks, referenceDate, universeName) }],
        // Model free Kenari adalah reasoning model: token 'berpikir' ikut dihitung
        // dalam max_tokens, jadi beri ruang cukup agar jawaban tidak habis di reasoning.
        max_tokens: 3000,
        temperature: 0.4,
        reasoning: { effort: 'low' },
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(aiTimeoutMs),
    });

    if (!response.ok) return { summary: '', error: aiUnavailable, configured: true };

    const data = await response.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { summary: '', error: aiUnavailable, configured: true };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Model kadang membungkus JSON dengan teks lain — coba ekstrak objeknya.
      const match = content.match(/\{[\s\S]*\}/);
      try {
        parsed = match ? JSON.parse(match[0]) : null;
      } catch {
        parsed = null;
      }
    }

    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
    const notes = Array.isArray(parsed?.notes)
      ? parsed.notes.filter((note) => typeof note?.symbol === 'string' && typeof note?.note === 'string')
      : [];

    return { summary, notes, configured: true };
  } catch {
    return { summary: '', error: aiUnavailable, configured: true };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function breakoutScan(request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Gunakan metode GET.' }, {
      status: 405,
      headers: { Allow: 'GET' },
    });
  }

  try {
    // Region mengikuti konvensi selector bursa di aplikasi; saat ini pemindaian
    // hanya meng-cover universe Indonesia (LQ45) lewat mode 'auto'.
    const params = new URL(request.url).searchParams;
    const region = params.get('region') ?? 'auto';
    const mode = params.get('mode') === 'demo' ? 'demo' : 'strict';
    const { name: universeName, symbols } = getUniverse(region);

    // Gunakan tanggal pasar Jakarta agar "hari ini" mengikuti sesi BEI.
    const marketDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const picks = await scanUniverse(symbols, marketDate, mode);
    const referenceDate = picks[0]?.date ?? marketDate.format(Date.now());

    let ai = { summary: '', notes: [], configured: Boolean(process.env.KENARI_API_KEY?.trim()) };
    if (picks.length > 0) {
      // Jangan pakai spread ganda — nilai undefined dari fungsi bisa menimpa default.
      ai = await summarizeWithKenari(picks, referenceDate, universeName);
      ai.notes ??= [];
    }

    // Gabungkan catatan AI ke masing-masing hasil bila ada.
    const noteBySymbol = new Map((ai.notes ?? []).map((note) => [note.symbol.toUpperCase(), note.note]));
    const results = picks.map((pick) => ({
      ...pick,
      aiNote: noteBySymbol.get(pick.symbol) ?? null,
    }));

    return Response.json({
      date: referenceDate,
      universe: universeName,
      region,
      mode,
      scanned: symbols.length,
      results,
      ai: {
        summary: ai.summary ?? '',
        configured: ai.configured,
        error: ai.error ?? null,
      },
    });
  } catch {
    return Response.json({ error: scanError }, { status: 502 });
  }
}
