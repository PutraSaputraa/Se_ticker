import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getLanguage, setLanguage, subscribeLanguage, t } from '../src/i18n.js';
import { formatDate, formatNumberRaw, formatPct, formatPrice, formatVolume } from '../src/format.js';
import { english } from '../src/locales/en.js';

afterEach(() => setLanguage('id'));

test('bahasa Indonesia tetap default dan pergantian bahasa memberi notifikasi tanpa menerima bahasa tak didukung', () => {
  assert.equal(getLanguage(), 'id');
  let notifications = 0;
  const unsubscribe = subscribeLanguage(() => { notifications += 1; });
  setLanguage('en');
  setLanguage('en');
  setLanguage('unknown');
  assert.equal(getLanguage(), 'en');
  assert.equal(notifications, 1);
  unsubscribe();
  setLanguage('id');
  assert.equal(notifications, 1);
});

test('teks antarmuka dan pesan API berparameter memakai katalog dengan placeholder aman', () => {
  setLanguage('en');
  assert.equal(t('Pantauan'), 'Watchlist');
  assert.equal(t('Harga pantauan {0} tersimpan', 'DEMO.JK'), 'Watch price for DEMO.JK saved');
  assert.equal(t('Ticker DEMO.JK tidak ditemukan di Yahoo Finance.'), 'Ticker DEMO.JK was not found on Yahoo Finance.');
  assert.equal(t('MA200 naik ≥30 hari'), 'MA200 rising for ≥30 days');
  assert.equal(t('Entry 1.2% di atas harga penutupan.'), 'Entry is 1.2% above the closing price.');
  assert.equal(t('Harga pantauan {0} tersimpan', '$&'), 'Watch price for $& saved');
  assert.equal(t('constructor'), 'constructor');
  assert.equal(t('Catatan pribadi yang tidak ada di katalog.'), 'Catatan pribadi yang tidak ada di katalog.');
  assert.equal(t(null), null);
});

test('terjemahan mempertahankan seluruh parameter pesan sumber', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort();
  for (const [source, translation] of Object.entries(english)) {
    assert.equal(typeof translation, 'string', source);
    assert.deepEqual(placeholders(translation), placeholders(source), source);
  }
});

test('tanggal, persen, dan volume mengikuti bahasa sementara mata uang dan format isian tetap akurat', () => {
  assert.match(formatDate('2026-11-18'), /Rabu/);
  assert.equal(formatPct(1.25), '+1,25%');
  assert.equal(formatPrice(12345, 'IDR'), 'Rp12.345');
  assert.equal(formatNumberRaw(12345.5, 'USD'), '12345.50');
  setLanguage('en');
  assert.match(formatDate('2026-11-18'), /Wednesday/);
  assert.equal(formatPct(1.25), '+1.25%');
  assert.equal(formatPrice(12345, 'IDR'), 'Rp12,345');
  assert.equal(formatVolume(12345), '12,345 shares');
  assert.equal(formatNumberRaw(12345.5, 'USD'), '12345.50');
});
