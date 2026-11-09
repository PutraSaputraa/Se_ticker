import {
  latestCompletedIndex,
  readSessions,
} from './shared/sessionLogic.js';
import { analyzeBaseBreakout } from './shared/breakoutLogic.js';
import { getUniverse, universeRegions } from './shared/universe.js';

const fetchConcurrency = 4;
const fetchTimeoutMs = 8_000;
// Model free Kenari adalah reasoning model dan bisa lambat (belasan detik),
// jadi beri batas waktu yang longgar agar tidak keburu di-abort.
const aiTimeoutMs = 120_000;
const maxScanResults = 10;

const noKeyError = 'Kunci API Kenari belum dikonfigurasi di server.';
const scanError = 'Pemindaian breakout gagal. Coba lagi nanti.';
const aiUnavailable = 'Ringkasan AI belum tersedia saat ini.';

const kenariHeaders = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
});

// ---------------------------------------------------------------------------
// Ambil sesi harian satu simbol dari Yahoo Finance.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mode 1 — Scan matematis (base breakout Minervini) lintas bursa.
// ---------------------------------------------------------------------------

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
    // Berurutan per bursa agar tidak memicu rate limit Yahoo.
    // eslint-disable-next-line no-await-in-loop
    results.push(await scanRegion(region));
  }
  const picks = results
    .flatMap((result) => result.picks)
    .sort((a, b) => (b.volumeRatio ?? 0) - (a.volumeRatio ?? 0))
    .slice(0, maxScanResults);
  const scanned = results.reduce((sum, result) => sum + result.scanned, 0);
  const universeName = regions.length === 1
    ? results[0].universeName
    : `${regions.length} bursa`;
  return { picks, scanned, universeName };
}

// ---------------------------------------------------------------------------
// Ringkasan scan matematis via Kenari (tanpa web search).
// ---------------------------------------------------------------------------

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

async function callKenari(apiKey, payload) {
  const response = await fetch('https://kenari.id/v1/chat/completions', {
    method: 'POST',
    headers: kenariHeaders(apiKey),
    body: JSON.stringify({
      model: 'kenari-free',
      max_tokens: 3000,
      temperature: 0.4,
      reasoning: { effort: 'low' },
      response_format: { type: 'json_object' },
      ...payload,
    }),
    signal: AbortSignal.timeout(aiTimeoutMs),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  return parseKenariJson(content);
}

async function summarizeMath(apiKey, picks, referenceDate) {
  if (!apiKey) return { summary: '', error: noKeyError, configured: false };
  try {
    const parsed = await callKenari(apiKey, {
      messages: [{ role: 'user', content: buildSummaryPrompt(picks, referenceDate) }],
    });
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
    const notes = Array.isArray(parsed?.notes)
      ? parsed.notes.filter((note) => typeof note?.symbol === 'string' && typeof note?.note === 'string')
      : [];
    if (!summary) return { summary: '', notes, error: aiUnavailable, configured: true };
    return { summary, notes, configured: true };
  } catch {
    return { summary: '', notes: [], error: aiUnavailable, configured: true };
  }
}

// ---------------------------------------------------------------------------
// Mode 2 — AI-riset: Kenari + web search (mirip prompt "cari dari internet").
// ---------------------------------------------------------------------------

function buildResearchPrompt(region, universeName) {
  const { name } = getUniverse(region);
  return [
    `Kamu trader pro bergaya Mark Minervini. Cari saham di bursa ${universeName} (${name}) yang sedang`,
    'KONSOLIDASI KETAT / membentuk base dan berpotensi breakout.',
    'Gunakan informasi terbaru dari internet, berita, dan TradingView via web search.',
    '',
    'Pilih hingga 7 ticker paling menarik. Untuk tiap ticker berikan analisis singkat.',
    '',
    'Jawab HANYA JSON valid persis berbentuk:',
    '{"picks":[{"symbol":"XXXX","name":"...","note":"analisis 1-2 kalimat","catalyst":"...","level":"..."}],',
    '"summary":"ringkasan 2-3 kalimat saham paling layak dipantau + alasan"}',
  ].join('\n');
}

async function runResearch(apiKey, region, universeName) {
  if (!apiKey) return { error: noKeyError, configured: false, picks: [], summary: '' };
  try {
    const parsed = await callKenari(apiKey, {
      messages: [{ role: 'user', content: buildResearchPrompt(region, universeName) }],
      tools: [{ type: 'kenari:web_search' }],
      tool_choice: 'auto',
      max_tokens: 4000,
    });
    const picks = Array.isArray(parsed?.picks)
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
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
    if (picks.length === 0 && !summary) {
      return { error: aiUnavailable, configured: true, picks: [], summary: '' };
    }
    return { picks, summary, configured: true };
  } catch {
    return { error: aiUnavailable, configured: true, picks: [], summary: '' };
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
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode') === 'research' ? 'research' : 'scan';
    const regionParam = params.get('region') ?? 'auto';
    const apiKey = process.env.KENARI_API_KEY?.trim() ?? '';

    if (mode === 'research') {
      const { name } = getUniverse(regionParam);
      const universeName = regionParam === 'auto' ? 'Indonesia (LQ45)' : name;
      const research = await runResearch(apiKey, regionParam, universeName);
      return Response.json({
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
      });
    }

    // Mode 'scan' (matematis). 'auto' = semua bursa; selain itu satu bursa.
    const regions = regionParam === 'auto' ? universeRegions : [regionParam];
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

    return Response.json({
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
    });
  } catch {
    return Response.json({ error: scanError }, { status: 502 });
  }
}
