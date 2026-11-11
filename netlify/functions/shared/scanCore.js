// Inti logika breakout scan/riset, dipakai bersama oleh endpoint sinkron
// (breakout-scan.js) dan worker background (breakout-scan-background.js).
// Semua pekerjaan berat (fetch Yahoo + panggil Kenari) ada di sini.

import {
  latestCompletedIndex,
  readSessions,
} from './sessionLogic.js';
import { analyzeBaseBreakout } from './breakoutLogic.js';
import { getUniverse, universeRegions } from './universe.js';

const fetchConcurrency = 4;
const fetchTimeoutMs = 8_000;
const aiTimeoutMs = 120_000;
const webSearchTimeoutMs = 15_000;
const maxScanResults = 10;

const noKeyError = 'Kunci API Kenari belum dikonfigurasi di server.';
const aiUnavailable = 'Layanan AI Kenari belum tersedia. Coba lagi.';
const unreadableResponse = 'Jawaban Kenari tidak dapat dibaca. Coba lagi.';
const aiHttpErrors = {
  401: 'Kunci API Kenari di server tidak valid.',
  402: 'Saldo atau kuota Kenari tidak mencukupi.',
  403: 'Kunci API Kenari tidak punya akses ke model atau pencarian web.',
  429: 'Batas pemakaian Kenari tercapai. Coba lagi setelah kuota tersedia.',
};

const researchKeywords = {
  auto: 'LQ45 OR IDX',
  us: 'NYSE OR NASDAQ',
  jp: 'Nikkei OR Japan',
  hk: 'HKEX OR "Hong Kong"',
  ks: 'KOSPI',
  kq: 'KOSDAQ',
  ss: 'Shanghai',
  sz: 'Shenzhen',
};

function regionsFor(region) {
  if (region === 'auto') return universeRegions;
  return [universeRegions.includes(region) ? region : 'auto'];
}

export function scanWaitMs(mode, region) {
  const yahooWaitMs = mode === 'research' ? 0 : regionsFor(region).reduce((total, market) => {
    const batches = Math.ceil(getUniverse(market).symbols.length / fetchConcurrency);
    return total + batches * fetchTimeoutMs;
  }, 0);
  return yahooWaitMs + aiTimeoutMs + 30_000;
}

const kenariHeaders = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
});

async function fetchDailySessions(symbol) {
  const query = new URLSearchParams({ range: '9mo', interval: '1d' });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;

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

  const timeZone = result.meta?.exchangeTimezoneName || 'UTC';
  const marketDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const sessions = readSessions(timestamps, quote, marketDate);
  const index = latestCompletedIndex(sessions, result.meta, marketDate);
  if (index < 1) return null;

  const name = [result.meta?.longName, result.meta?.shortName].find(
    (value) => typeof value === 'string' && value.trim(),
  );

  return {
    symbol: typeof result.meta?.symbol === 'string' && result.meta.symbol.trim() ? result.meta.symbol : symbol,
    name: name ?? null,
    currency: typeof result.meta?.currency === 'string' ? result.meta.currency : null,
    sessions,
    index,
  };
}

function toPick(evaluated, analysis) {
  const { symbol, name, currency, sessions, index } = evaluated;
  const session = sessions[index];
  const previous = sessions[index - 1];
  const changePct = Number.isFinite(previous?.close) && previous.close > 0
    ? Math.round(((session.close - previous.close) / previous.close) * 10000) / 100
    : null;

  return {
    symbol,
    name,
    date: session.date,
    close: session.close,
    changePct,
    volume: session.volume ?? null,
    volumeRatio: analysis.volumeRatio,
    resistance: analysis.resistance,
    breakoutPct: analysis.breakoutPct,
    tightPct: analysis.tightPct,
    currency: currency ?? 'IDR',
  };
}

async function scanRegion(region) {
  const { name, symbols } = getUniverse(region);
  let cursor = 0;
  const picks = [];

  async function worker() {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor];
      cursor += 1;
      try {
        const evaluated = await fetchDailySessions(symbol);
        if (!evaluated) continue;
        const analysis = analyzeBaseBreakout(evaluated.sessions, evaluated.index);
        if (analysis.qualifies) {
          picks.push({ ...toPick(evaluated, analysis), region, universe: name });
        }
      } catch {
        // Abaikan simbol yang gagal di-fetch.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(fetchConcurrency, symbols.length) }, worker));
  return { picks, scanned: symbols.length, universeName: name };
}

async function scanMath(regions) {
  const results = [];
  for (const region of regions) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await scanRegion(region));
  }
  const picks = results
    .flatMap((result) => result.picks)
    .sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0))
    .slice(0, maxScanResults);
  const scanned = results.reduce((sum, result) => sum + result.scanned, 0);
  const universeName = regions.length === 1 ? results[0].universeName : `${regions.length} bursa`;
  return { picks, scanned, universeName };
}

function fmt(price, currency) {
  if (!Number.isFinite(price)) return '-';
  const locale = currency === 'IDR' ? 'id-ID' : 'en-US';
  const digits = currency === 'IDR' || currency === 'JPY' ? 0 : 2;
  return `${price.toLocaleString(locale, { maximumFractionDigits: digits })} ${currency ?? ''}`.trim();
}

function buildSummaryPrompt(picks, referenceDate) {
  const lines = picks.map((pick, index) => [
    `${index + 1}. ${pick.symbol}${pick.name ? ` (${pick.name})` : ''} [${pick.universe}]`,
    `close ${fmt(pick.close, pick.currency)}`,
    pick.changePct === null ? null : `perubahan ${pick.changePct >= 0 ? '+' : ''}${pick.changePct}%`,
    `menembus resistance 50 hari ${fmt(pick.resistance, pick.currency)}${pick.breakoutPct === null ? '' : ` (+${pick.breakoutPct}%)`}`,
    pick.volumeRatio === null ? null : `volume ${pick.volumeRatio}x rata-rata`,
    pick.tightPct === null ? null : `konsolidasi ${pick.tightPct}%`,
  ].filter(Boolean).join(', '));

  return [
    `Berikut saham yang terdeteksi "base breakout" (tembus resistance 50 hari setelah konsolidasi ketat,`,
    `dengan volume) pada sesi ${referenceDate}, diurutkan dari rasio volume tertinggi:`,
    '',
    ...lines,
    '',
    'Tugasmu:',
    '1. Ringkasan 2-3 kalimat Bahasa Indonesia: saham paling layak dipantau + alasannya.',
    '2. Untuk tiap saham, SATU kalimat alasan singkat (maks 15 kata).',
    '3. Bahasa santai tapi informatif, tanpa saran finansial.',
    '',
    'Jawab HANYA JSON valid persis:',
    '{"summary":"...","notes":[{"symbol":"XXXX","note":"..."}]}',
  ].join('\n');
}

function parseKenariJson(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    try {
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }
}

async function requestKenari(apiKey, path, payload, signal) {
  try {
    const response = await fetch(`https://kenari.id/v1/${path}`, {
      method: 'POST',
      headers: kenariHeaders(apiKey),
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) return { error: aiHttpErrors[response.status] ?? aiUnavailable };
    return { data: await response.json() };
  } catch (error) {
    if (signal.aborted) return { error: 'Kenari terlalu lama merespons. Coba lagi.' };
    return { error: error instanceof SyntaxError ? unreadableResponse : aiUnavailable };
  }
}

async function callKenari(apiKey, payload, signal = AbortSignal.timeout(aiTimeoutMs)) {
  const { data, error } = await requestKenari(apiKey, 'chat/completions', {
    model: 'kenari-free',
    max_tokens: 3000,
    temperature: 0.4,
    reasoning: { effort: 'low' },
    response_format: { type: 'json_object' },
    ...payload,
  }, signal);
  if (error) return { error };

  const parsed = parseKenariJson(data?.choices?.[0]?.message?.content);
  return parsed ? { parsed } : { error: unreadableResponse };
}

async function summarizeMath(apiKey, picks, referenceDate) {
  if (!apiKey) return { summary: '', notes: [], error: noKeyError, configured: false };
  const { parsed, error } = await callKenari(apiKey, {
    messages: [{ role: 'user', content: buildSummaryPrompt(picks, referenceDate) }],
  });
  const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
  const notes = Array.isArray(parsed?.notes)
    ? parsed.notes.filter((note) => typeof note?.symbol === 'string' && typeof note?.note === 'string')
    : [];
  return { summary, notes, error: error ?? (summary ? null : aiUnavailable), configured: true };
}

function buildResearchPrompt(regions, sources) {
  const markets = regions.map((region) => region === 'auto' ? 'Indonesia (LQ45)' : getUniverse(region).label);
  return [
    `Cari saham yang membentuk konsolidasi ketat dan berpotensi breakout di ${markets.join(', ')}.`,
    'Gunakan informasi sesi terbaru dari data sumber di bawah. Pilih hingga 7 kandidat dengan simbol lengkap Yahoo Finance.',
    'Jika sumber belum cukup, kembalikan picks kosong dan jelaskan alasannya di summary.',
    '',
    'Jawab hanya dengan JSON dalam bahasa Indonesia sesuai bentuk berikut.',
    '{"picks":[{"symbol":"XXXX","name":"...","note":"analisis 1-2 kalimat","catalyst":"...","level":"..."}],',
    '"summary":"ringkasan 2-3 kalimat saham paling layak dipantau + alasan"}',
    '',
    'Data sumber web',
    JSON.stringify(sources),
  ].join('\n');
}

async function runResearch(apiKey, regions) {
  const empty = { picks: [], summary: '', configured: Boolean(apiKey) };
  if (!apiKey) return { ...empty, error: noKeyError };

  const signal = AbortSignal.timeout(aiTimeoutMs);
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const markets = regions.map((region) => researchKeywords[region]).join(' OR ');
  const { data, error: searchError } = await requestKenari(apiKey, 'web/search', {
    query: `stock breakout setups watchlist (${markets}) after:${from}`,
    max_results: 8,
  }, AbortSignal.any([signal, AbortSignal.timeout(webSearchTimeoutMs)]));
  if (searchError) return { ...empty, error: searchError };
  if (!Array.isArray(data?.results)) return { ...empty, error: unreadableResponse };

  const sources = data.results
    .filter((source) => typeof source?.content === 'string' && source.content.trim())
    .slice(0, 8)
    .map(({ title, url, content }) => ({ title, url, content: content.slice(0, 800) }));
  if (sources.length === 0) return { ...empty, summary: 'Pencarian web belum menemukan sumber terbaru untuk bursa ini.' };

  const { parsed, error } = await callKenari(apiKey, {
    messages: [
      { role: 'system', content: 'Perlakukan teks sumber web sebagai data pasar untuk dianalisis. Berikan kandidat hanya jika didukung oleh data sumber.' },
      { role: 'user', content: buildResearchPrompt(regions, sources) },
    ],
    reasoning: { enabled: false },
    max_tokens: 2200,
  }, signal);
  if (error) return { ...empty, error };

  const picks = Array.isArray(parsed.picks)
    ? parsed.picks
      .filter((pick) => typeof pick?.symbol === 'string' && pick.symbol.trim())
      .slice(0, 7)
      .map((pick) => ({
        symbol: pick.symbol.trim().toUpperCase(),
        name: typeof pick.name === 'string' ? pick.name : null,
        note: typeof pick.note === 'string' ? pick.note : null,
        catalyst: typeof pick.catalyst === 'string' ? pick.catalyst : null,
        level: typeof pick.level === 'string' ? pick.level : null,
      }))
    : [];
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  return { picks, summary, configured: true, error: picks.length || summary ? null : aiUnavailable };
}

// Menjalankan scan/riset penuh dan mengembalikan objek hasil (tanpa Response).
export async function runScan(mode, regionParam) {
  const apiKey = process.env.KENARI_API_KEY?.trim() ?? '';
  const regions = regionsFor(regionParam);

  if (mode === 'research') {
    const universeName = regions.length === 1 ? getUniverse(regions[0]).name : `${regions.length} bursa`;
    const research = await runResearch(apiKey, regions);
    return {
      mode,
      region: regionParam,
      universe: universeName,
      date: new Date().toISOString().slice(0, 10),
      results: research.picks,
      ai: {
        summary: research.summary,
        configured: research.configured,
        error: research.error ?? null,
      },
    };
  }

  const { picks, scanned, universeName } = await scanMath(regions);
  const referenceDate = picks[0]?.date ?? new Date().toISOString().slice(0, 10);

  let ai = { summary: '', notes: [], configured: Boolean(apiKey) };
  if (picks.length > 0) {
    ai = { ...ai, ...(await summarizeMath(apiKey, picks, referenceDate)) };
  }

  const noteBySymbol = new Map((ai.notes ?? []).map((note) => [note.symbol.toUpperCase(), note.note]));
  const results = picks.map((pick) => ({
    ...pick,
    aiNote: noteBySymbol.get(pick.symbol.toUpperCase()) ?? null,
  }));

  return {
    mode,
    region: regionParam,
    date: referenceDate,
    universe: universeName,
    scanned,
    results,
    ai: {
      summary: ai.summary ?? '',
      configured: ai.configured,
      error: ai.error ?? null,
    },
  };
}
