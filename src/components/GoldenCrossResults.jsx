import { useEffect, useId, useRef, useState } from 'react';
import CandlestickChart from '../CandlestickChart.jsx';
import { consolidationSessionDate } from '../consolidationView.js';
import { formatDate, formatDateCompact, formatPrice, formatVolume } from '../format.js';
import { localizedNumberFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import ScannerWatchAction from './ScannerWatchAction.jsx';
import TableScroll from './TableScroll.jsx';
import TickerLink from './TickerLink.jsx';
import '../styles/golden-cross.css';

export const goldenCrossTimeframes = { daily: 'Harian', weekly: 'Mingguan' };

const countFormat = localizedNumberFormat();
const directions = [
  { signal: 'golden', label: 'Golden Cross', title: '{0} Golden Cross pada {1}', rule: '{0} 50 memotong ke atas {0} 200.' },
  { signal: 'death', label: 'Death Cross', title: '{0} Death Cross pada {1}', rule: '{0} 50 memotong ke bawah {0} 200.' },
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

function CrossAnalysis({ pick, timeframe, isCrypto, onClose }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const titleId = useId();
  const factsId = useId();
  const { candles, close, currency, date, fast, method, signal, slow } = pick;
  const direction = directions.find(item => item.signal === signal);
  const last = Array.isArray(candles) ? candles.at(-1) : null;
  const chartReady = last && last.date === date && last.close === close && last.fast === fast && last.slow === slow
    && candles.length > 1 && candles.every(bar => consolidationSessionDate(bar?.date, timeframe) && Number.isFinite(bar.close));
  const displayPrice = value => crossPrice(value, currency, 4);
  const displayVolume = value => formatVolume(value, { includeUnit: !isCrypto });

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="consolidation-analysis cross-analysis" data-signal={signal} aria-labelledby={titleId} onClose={onClose}>
      <header className="consolidation-analysis-heading">
        <div>
          <h2 id={titleId}>{t(direction.title, method, pick.symbol)}</h2>
          {pick.name && <p className="research-company">{pick.name}</p>}
        </div>
        <button type="button" className="research-watch" autoFocus onClick={() => dialog.current.close()}>{t('Tutup')}</button>
      </header>
      <div className="consolidation-analysis-body">
        {chartReady ? (
          <CandlestickChart sessions={candles} referenceDate={date} referenceLabel={direction.label} markReference
            timeframe={timeframe === 'weekly' ? '1wk' : '1d'} formatDate={formatDate} formatPrice={displayPrice} formatVolume={displayVolume}
            movingAverages={[
              { kind: 'fast', label: `${method} 50`, values: candles.map(bar => bar.fast) },
              { kind: 'slow', label: `${method} 200`, values: candles.map(bar => bar.slow) },
            ]} />
        ) : <p className="research-empty">{t('Riwayat harga belum tersedia untuk hasil ini. Pindai ulang untuk mendapatkan hasil baru beserta riwayatnya.')}</p>}
        <section className="consolidation-analysis-facts" aria-labelledby={factsId}>
          <h3 id={factsId}>{t('Rincian sinyal')}</h3>
          <dl className="consolidation-facts">
            <div><dt>{t('Tanggal sinyal')}</dt><dd><time dateTime={date}>{formatDate(date)}</time></dd></div>
            <div><dt>{t('Harga tutup')}</dt><dd>{crossPrice(close, currency)}</dd></div>
            <div><dt>{method} 50</dt><dd>{displayPrice(fast)}</dd></div>
            <div><dt>{method} 200</dt><dd>{displayPrice(slow)}</dd></div>
          </dl>
          <p className="consolidation-muted">{t(direction.rule, method)}</p>
        </section>
      </div>
    </dialog>
  );
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

function CrossActions({ pick, watchlistEntry, disabled, onAdd, onInspect }) {
  const { t } = useTranslation();
  const category = pick.signal === 'golden' ? 'golden-cross' : 'death-cross';
  return (
    <div className="cross-actions">
      <button type="button" className="research-watch" aria-haspopup="dialog" aria-label={t('Lihat grafik {0}', pick.symbol)}
        onClick={event => onInspect({ pick, trigger: event.currentTarget })}>
        {t('Lihat grafik')}
      </button>
      <ScannerWatchAction symbol={pick.symbol} entry={watchlistEntry} category={category} disabled={disabled} onAdd={onAdd} />
    </div>
  );
}

function CrossList({ method, title, picks, watched, disabled, onAdd, onInspect }) {
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
            <CrossActions pick={pick} watchlistEntry={watched.get(pick.symbol)} disabled={disabled} onAdd={onAdd} onInspect={onInspect} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CrossTable({ method, title, picks, watched, disabled, onAdd, onInspect }) {
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
                <td className="num">
                  <CrossActions pick={pick} watchlistEntry={watched.get(pick.symbol)} disabled={disabled} onAdd={onAdd} onInspect={onInspect} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function CrossGroup({ method, direction, picks, watched, disabled, onAdd, onInspect }) {
  const { t } = useTranslation();
  const id = useId();
  const title = `${method} ${t(direction.label)}`;
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
          <CrossTable method={method} title={title} picks={picks} watched={watched} disabled={disabled} onAdd={onAdd} onInspect={onInspect} />
          <CrossList method={method} title={title} picks={picks} watched={watched} disabled={disabled} onAdd={onAdd} onInspect={onInspect} />
        </>
      ) : <p className="cross-empty">{t('Belum ada sinyal pada candle terakhir yang sudah tutup.')}</p>}
    </section>
  );
}

export default function GoldenCrossResults({ result, method, onMethodChange, stale, watched, disabled, onAdd }) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState(null);
  const title = useRef(null);
  const picks = result.results.filter(pick => pick.method === method);
  const coverage = t('{0} dari {1} aset diperiksa', countFormat.format(result.checked), countFormat.format(result.scanned));

  function closeAnalysis() {
    const source = selection?.trigger;
    setSelection(null);
    (source?.isConnected && source.getClientRects().length ? source : title.current)?.focus({ preventScroll: true });
  }

  return (
    <section className="research-panel recommend-panel cross-results" aria-labelledby="cross-results-title">
      <header className="research-panel-heading">
        <div className="section-accent">
          <h2 id="cross-results-title" ref={title} tabIndex={-1}>{t('Hasil Golden Cross dan Death Cross')}</h2>
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
          picks={picks.filter(pick => pick.signal === direction.signal)} watched={watched} disabled={disabled} onAdd={onAdd} onInspect={setSelection} />
      ))}
      <CrossReference />
      {selection && <CrossAnalysis pick={selection.pick} timeframe={result.timeframe} isCrypto={result.region === 'crypto'} onClose={closeAnalysis} />}
    </section>
  );
}
