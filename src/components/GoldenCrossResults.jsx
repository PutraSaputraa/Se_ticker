import { useId } from 'react';
import { formatDateCompact, formatPrice } from '../format.js';
import { localizedNumberFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import ScannerWatchAction from './ScannerWatchAction.jsx';
import TableScroll from './TableScroll.jsx';
import TickerLink from './TickerLink.jsx';
import '../styles/golden-cross.css';

export const goldenCrossTimeframes = { daily: 'Harian', weekly: 'Mingguan' };

const countFormat = localizedNumberFormat();
const directions = [
  { signal: 'golden', label: '{0} Golden Cross', rule: '{0} 50 memotong ke atas {0} 200.' },
  { signal: 'death', label: '{0} Death Cross', rule: '{0} 50 memotong ke bawah {0} 200.' },
];
const comparison = [
  ['Respons harga', 'Lebih lambat', 'Lebih cepat'],
  ['Sensitivitas', 'Lebih rendah', 'Lebih tinggi'],
  ['False signal', 'Relatif lebih sedikit', 'Bisa lebih banyak'],
  ['Karakter', 'Konfirmasi tren', 'Lebih responsif'],
];

function crossPrice(value, currency, digits) {
  return formatPrice(value, currency, currency === 'USD' && value < 1 ? 6 : digits);
}

function CrossReference() {
  const { t } = useTranslation();
  return (
    <section className="cross-reference" aria-labelledby="cross-reference-title">
      <h3 id="cross-reference-title">{t('Perbandingan SMA dan EMA')}</h3>
      <table className="fund-table" aria-labelledby="cross-reference-title">
        <thead>
          <tr>
            <th scope="col">{t('Aspek')}</th>
            <th scope="col">SMA 50/200</th>
            <th scope="col">EMA 50/200</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map(([aspect, sma, ema]) => (
            <tr key={aspect}>
              <th scope="row">{t(aspect)}</th>
              <td>{t(sma)}</td>
              <td>{t(ema)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CrossList({ method, title, picks, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  return (
    <ul className="scan-list cross-list" role="list" aria-label={title}>
      {picks.map(pick => (
        <li className="scan-list-item" key={pick.symbol}>
          <div className="scan-item-heading">
            <div>
              <TickerLink symbol={pick.symbol} />
              {pick.name && <p className="research-company">{pick.name}</p>}
            </div>
            <div className="scan-item-price">
              <span>{t('Harga tutup')}</span>
              <strong>{crossPrice(pick.close, pick.currency)}</strong>
            </div>
          </div>
          <dl className="scan-item-metrics">
            <div><dt>{method} 50</dt><dd>{crossPrice(pick.fast, pick.currency, 4)}</dd></div>
            <div><dt>{method} 200</dt><dd>{crossPrice(pick.slow, pick.currency, 4)}</dd></div>
          </dl>
          <div className="cross-list-footer">
            <div className="cross-list-date">
              <span>{t('Tanggal sinyal')}</span>
              <time dateTime={pick.date}>{formatDateCompact(pick.date)}</time>
            </div>
            <ScannerWatchAction symbol={pick.symbol} inWatchlist={watched.has(pick.symbol)} disabled={disabled} onAdd={onAdd} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CrossTable({ method, title, picks, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  return (
    <div className="scan-table-layout">
      <TableScroll className="research-table-scroll" label={t('Tabel hasil {0}', title)}>
        <table className="fund-table research-table cross-table">
          <thead>
            <tr>
              <th scope="col">Ticker</th>
              <th scope="col">{t('Tanggal sinyal')}</th>
              <th scope="col" className="num">{t('Harga tutup')}</th>
              <th scope="col" className="num">{method} 50</th>
              <th scope="col" className="num">{method} 200</th>
              <th scope="col" className="num">{t('Aksi')}</th>
            </tr>
          </thead>
          <tbody>
            {picks.map(pick => (
              <tr key={pick.symbol}>
                <th scope="row" className="research-instrument">
                  <TickerLink symbol={pick.symbol} />
                  {pick.name && <span className="research-cell-note">{pick.name}</span>}
                </th>
                <td><time dateTime={pick.date}>{formatDateCompact(pick.date)}</time></td>
                <td className="num">{crossPrice(pick.close, pick.currency)}</td>
                <td className="num">{crossPrice(pick.fast, pick.currency, 4)}</td>
                <td className="num">{crossPrice(pick.slow, pick.currency, 4)}</td>
                <td className="num"><ScannerWatchAction symbol={pick.symbol} inWatchlist={watched.has(pick.symbol)} disabled={disabled} onAdd={onAdd} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function CrossGroup({ method, direction, picks, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  const id = useId();
  const title = t(direction.label, method);
  return (
    <section className="cross-group" data-signal={direction.signal} aria-labelledby={id}>
      <header className="cross-group-heading">
        <div>
          <h3 id={id}>{title}</h3>
          <p>{t(direction.rule, method)}</p>
        </div>
        <span>{t(picks.length === 1 ? '1 sinyal' : '{0} sinyal', countFormat.format(picks.length))}</span>
      </header>
      {picks.length > 0 ? (
        <>
          <CrossTable method={method} title={title} picks={picks} watched={watched} disabled={disabled} onAdd={onAdd} />
          <CrossList method={method} title={title} picks={picks} watched={watched} disabled={disabled} onAdd={onAdd} />
        </>
      ) : <p className="cross-empty">{t('Belum ada sinyal pada candle terakhir yang sudah tutup.')}</p>}
    </section>
  );
}

export default function GoldenCrossResults({ result, method, onMethodChange, stale, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  const picks = result.results.filter(pick => pick.method === method);
  const coverage = t('{0} dari {1} aset diperiksa', countFormat.format(result.checked), countFormat.format(result.scanned));

  return (
    <section className="research-panel recommend-panel cross-results" aria-labelledby="cross-results-title">
      <header className="research-panel-heading">
        <div className="section-accent">
          <h2 id="cross-results-title">{t('Hasil Golden Cross dan Death Cross')}</h2>
          <p>{[t(goldenCrossTimeframes[result.timeframe]), t(result.universe), coverage].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="candle-timeframe" role="group" aria-label={t('Jenis moving average')}>
          {['SMA', 'EMA'].map(value => (
            <button key={value} type="button" aria-pressed={method === value}
              className={`candle-timeframe-btn${method === value ? ' candle-timeframe-btn--active' : ''}`}
              onClick={() => onMethodChange(value)}>
              {value} 50/200
            </button>
          ))}
        </div>
      </header>
      {stale && <p className="consolidation-stale">{t('Menampilkan hasil pemindaian sebelumnya untuk pilihan ini.')}</p>}
      {result.checked === 0 ? (
        <p className="research-empty">{t('Data harga belum cukup. Pemindaian membutuhkan minimal 201 candle yang sudah tutup per aset.')}</p>
      ) : directions.map(direction => (
        <CrossGroup key={direction.signal} method={method} direction={direction}
          picks={picks.filter(pick => pick.signal === direction.signal)} watched={watched} disabled={disabled} onAdd={onAdd} />
      ))}
      <CrossReference />
    </section>
  );
}
