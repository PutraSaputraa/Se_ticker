import { useEffect, useState } from 'react';

const refreshInterval = 60_000;
const concurrency = 4;
const unavailable = 'Harga dari Yahoo Finance belum tersedia. Coba lagi.';

async function fetchJournalData(symbol, { date, fallback, signal, lookup } = {}) {
  const params = new URLSearchParams({ symbol, mode: 'journal' });
  if (date) params.set('date', date);
  if (fallback) params.set('fallback', fallback);
  if (lookup) params.set('lookup', lookup);
  const timeout = AbortSignal.timeout(15_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(`/.netlify/functions/price?${params}`, { cache: 'no-store', signal: requestSignal }).catch(() => null);
  const data = await response?.json().catch(() => null);
  if (!response?.ok || !data?.currency) throw new Error(data?.error ?? unavailable);
  return data;
}

export function fetchJournalInstrument(symbol, fallback) {
  return fetchJournalData(symbol, { fallback, lookup: 'instrument' });
}

export async function fetchJournalQuote(symbol, options) {
  const quote = await fetchJournalData(symbol, options);
  if (!Number.isFinite(quote.price) || quote.price <= 0 || !quote.date) {
    throw new Error(quote.error ?? unavailable);
  }
  return quote;
}

export default function useJournalQuotes(trades) {
  const symbolsKey = JSON.stringify([...new Set(trades.map((trade) => trade.pair))].sort());
  const [quotes, setQuotes] = useState({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const symbols = JSON.parse(symbolsKey);
    if (!symbols.length) {
      setQuotes({});
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    let timer;
    let updating = false;

    async function updateQuotes() {
      if (document.hidden || signal.aborted || updating) return;
      updating = true;
      window.clearTimeout(timer);
      setQuotes((previous) => Object.fromEntries(symbols.map((symbol) => [
        symbol, { quote: previous[symbol]?.quote, loading: true },
      ])));

      let nextIndex = 0;
      async function worker() {
        while (!signal.aborted && nextIndex < symbols.length) {
          const symbol = symbols[nextIndex++];
          let result;
          try {
            result = { quote: await fetchJournalQuote(symbol, { signal }) };
          } catch (error) {
            result = { error: error.message };
          }
          if (!signal.aborted) setQuotes((previous) => ({ ...previous, [symbol]: result }));
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));
      updating = false;
      if (!signal.aborted) timer = window.setTimeout(updateQuotes, refreshInterval);
    }

    updateQuotes();
    document.addEventListener('visibilitychange', updateQuotes);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', updateQuotes);
    };
  }, [symbolsKey, attempt]);

  return { quotes, refresh: () => setAttempt((value) => value + 1) };
}
