import { english } from './locales/en.js';

export const languageStorageKey = 'cek-saham:language';
let language = 'id';
try {
  if (globalThis.localStorage?.getItem(languageStorageKey) === 'en') language = 'en';
} catch {}

const listeners = new Set();
export function getLanguage() { return language; }
export function getLocale() { return language === 'en' ? 'en-US' : 'id-ID'; }
export function subscribeLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLanguage(next) {
  if (next !== 'id' && next !== 'en') return;
  const changed = next !== language;
  language = next;
  try { globalThis.localStorage?.setItem(languageStorageKey, next); } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('Cek OHLCV saham, level Buy Trigger, dan volume per sesi perdagangan.'));
  }
  if (changed) listeners.forEach((listener) => listener());
}

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key)).map(([source, target]) => {
  const indices = [...source.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
  return {
    match: new RegExp(`^${source.split(/\{\d+\}/).map(escapePattern).join('(.+?)')}$`, 's'),
    target, indices,
  };
});

// Indonesian text is the message ID. Stored user content is passed through unchanged.
export function t(source, ...values) {
  if (typeof source !== 'string') return source;
  let message = source;
  if (language === 'en') {
    message = Object.hasOwn(english, source) ? english[source] : source;
    // API and validation messages can arrive with their parameters already inserted.
    if (message === source && !values.length) {
      for (const { match, target, indices } of patterns) {
        const found = source.match(match);
        if (!found) continue;
        const parameters = [];
        indices.forEach((index, offset) => { parameters[index] = t(found[offset + 1]); });
        return target.replace(/\{(\d+)\}/g, (_, index) => parameters[index] ?? '');
      }
    }
  }
  return message.replace(/\{(\d+)\}/g, (placeholder, index) => values[index] ?? placeholder);
}

const dateFormats = new Map();
const numberFormats = new Map();
export function localizedDateFormat(options) {
  return { format(value) {
    const key = getLocale() + JSON.stringify(options);
    if (!dateFormats.has(key)) dateFormats.set(key, new Intl.DateTimeFormat(getLocale(), options));
    return dateFormats.get(key).format(value);
  } };
}
export function localizedNumberFormat(options) {
  return { format(value) {
    const key = getLocale() + JSON.stringify(options);
    if (!numberFormats.has(key)) numberFormats.set(key, new Intl.NumberFormat(getLocale(), options));
    return numberFormats.get(key).format(value);
  } };
}
