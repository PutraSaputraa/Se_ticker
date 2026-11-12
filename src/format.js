// Helper format bersama untuk seluruh halaman.
export const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export const shortDateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC' });
export const compactDateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});
const volumeFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

export function formatDate(date) {
  if (!date) return 'Tidak tersedia';
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
  if (!Number.isFinite(price)) return 'Tidak tersedia';
  const integer = { maximumFractionDigits: maxFractionDigits ?? 0 };
  const decimal = { minimumFractionDigits: 2, maximumFractionDigits: maxFractionDigits ?? 2 };
  if (currency === 'JPY') return `¥${price.toLocaleString('id-ID', integer)}`;
  if (currency === 'IDR') return `Rp${price.toLocaleString('id-ID', integer)}`;
  if (currency === 'USD') return `$${price.toLocaleString('en-US', decimal)}`;
  if (currency === 'HKD') return `HK$${price.toLocaleString('en-US', decimal)}`;
  if (currency === 'KRW') return `₩${price.toLocaleString('id-ID', integer)}`;
  if (currency === 'CNY') return `¥${price.toLocaleString('en-US', decimal)}`;
  return `${currency} ${price.toLocaleString('id-ID', decimal)}`;
}

export function formatPnl(value, currency, precision) {
  if (!Number.isFinite(value)) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatPrice(Math.abs(value), currency, precision)}`;
}

export function formatVolume(volume) {
  return volume == null ? 'Tidak tersedia' : `${volumeFormat.format(volume)} lembar`;
}

export function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 2 })} T`;
  if (abs >= 1e9) return `${(value / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1e6) return `${(value / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jt`;
  return value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

export function formatPct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
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
