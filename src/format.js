import { getLanguage, getLocale, localizedDateFormat, localizedNumberFormat, t } from './i18n.js';

// Format tampilan mengikuti bahasa, sementara format isian tetap stabil.
export const dateFormat = localizedDateFormat({
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export const shortDateFormat = localizedDateFormat({ timeZone: 'UTC' });
export const compactDateFormat = localizedDateFormat({
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});
const volumeFormat = localizedNumberFormat({ maximumFractionDigits: 2 });

export function formatDate(date) {
  if (!date) return t('Tidak tersedia');
  try {
    return dateFormat.format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}

// Versi ringkas ("6 Nov") untuk tabel sempit seperti OHLCV di panel kiri.
export function formatDateCompact(date) {
  if (!date) return '—';
  try {
    return compactDateFormat.format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
}

export function formatPrice(price, currency, maxFractionDigits) {
  if (!Number.isFinite(price)) return t('Tidak tersedia');
  const integer = { maximumFractionDigits: maxFractionDigits ?? 0 };
  const decimal = { minimumFractionDigits: 2, maximumFractionDigits: maxFractionDigits ?? 2 };
  const integerLocale = getLocale();
  const decimalLocale = getLanguage() === 'id' ? 'en-US' : getLocale();
  if (currency === 'JPY') return `¥${price.toLocaleString(integerLocale, integer)}`;
  if (currency === 'IDR') return `Rp${price.toLocaleString(integerLocale, integer)}`;
  if (currency === 'USD') return `$${price.toLocaleString(decimalLocale, decimal)}`;
  if (currency === 'HKD') return `HK$${price.toLocaleString(decimalLocale, decimal)}`;
  if (currency === 'KRW') return `₩${price.toLocaleString(integerLocale, integer)}`;
  if (currency === 'CNY') return `¥${price.toLocaleString(decimalLocale, decimal)}`;
  return `${currency} ${price.toLocaleString(getLocale(), decimal)}`;
}

export function formatPnl(value, currency, precision) {
  if (!Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPrice(Math.abs(value), currency, precision)}`;
}

export function formatVolume(volume, { includeUnit = true } = {}) {
  if (volume == null) return t('Tidak tersedia');
  const formatted = volumeFormat.format(volume);
  return includeUnit ? t('{0} lembar', formatted) : formatted;
}

export function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return t('{0} T', (value / 1e12).toLocaleString(getLocale(), { maximumFractionDigits: 2 }));
  if (abs >= 1e9) return t('{0} M', (value / 1e9).toLocaleString(getLocale(), { maximumFractionDigits: 2 }));
  if (abs >= 1e6) return t('{0} jt', (value / 1e6).toLocaleString(getLocale(), { maximumFractionDigits: 2 }));
  return value.toLocaleString(getLocale(), { maximumFractionDigits: 2 });
}

export function formatPct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toLocaleString(getLocale(), { maximumFractionDigits: 2 })}%`;
}

export function priceDecimals(currency) {
  return currency === 'JPY' || currency === 'IDR' || currency === 'KRW' ? 0 : 2;
}

export function formatNumberRaw(price, currency) {
  const decimals = priceDecimals(currency);
  return price.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
