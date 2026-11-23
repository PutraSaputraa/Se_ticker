import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  consolidationSessionDate,
  consolidationSessionLabel,
  consolidationZoneLabel,
  countFormat,
  locationBounds,
  locationLabels,
  positionFormat,
  validCount,
} from '../consolidationView.js';
import useTranslation from '../useTranslation.js';

const glossary = {
  consolidation: ['Konsolidasi', 'Harga bergerak dalam rentang yang relatif tetap sesuai kriteria pemindai.'],
  close: ['Harga tutup acuan', 'Harga penutupan pada sesi, pekan, atau bulan terakhir yang sudah selesai saat pemindaian.'],
  support: ['Zona support', 'Area harga tempat penurunan sebelumnya cenderung mendapat respons pembelian. Support dapat ditembus.'],
  resistance: ['Zona resistance', 'Area harga tempat kenaikan sebelumnya cenderung mendapat tekanan penjualan. Resistance dapat ditembus.'],
  position: ['Posisi harga', 'Persentase menunjukkan posisi harga tutup dari batas bawah support (0%) ke batas atas resistance (100%). Angka ini hanya mengukur letak harga.'],
  reactions: ['Reaksi terdeteksi', 'Pemindai mengelompokkan titik balik di sekitar tiap zona. Titik balik berikutnya dihitung sebagai reaksi baru bila di antaranya harga tutup sempat bergerak kembali ke dalam rentang sejauh seperempat jarak antara kedua zona.'],
  duration: ['Durasi rentang', 'Durasi menghitung candle yang sudah selesai dan datanya valid. Satu candle mewakili satu sesi, pekan, atau bulan sesuai timeframe.'],
};

const durationUnits = { daily: '{0} sesi', weekly: '{0} pekan', monthly: '{0} bulan' };

export function ConsolidationHelp({ label, topics }) {
  const { t } = useTranslation();
  const id = useId();
  const trigger = useRef(null);
  const popup = useRef(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = popup.current;
    function place() {
      if (!panel.matches(':popover-open')) return;
      const bounds = trigger.current.getBoundingClientRect();
      const { clientWidth: width, clientHeight: height } = document.documentElement;
      const gap = 8;
      const left = Math.max(gap, Math.min(bounds.left, width - panel.offsetWidth - gap));
      const below = bounds.bottom + gap;
      const above = bounds.top - panel.offsetHeight - gap;
      const top = Math.max(gap, Math.min(below + panel.offsetHeight <= height - gap ? below : above, height - panel.offsetHeight - gap));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    }
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <>
      <button type="button" ref={trigger} className="consolidation-info-button" popoverTarget={id}
        aria-label={t('Info {0}', t(label))} aria-controls={id} aria-expanded={open}>
        <span aria-hidden="true">i</span>
      </button>
      <div id={id} ref={popup} popover="auto" role="region" aria-label={t(label)} className="consolidation-help"
        data-positioned={open} onToggle={event => setOpen(event.currentTarget.matches(':popover-open'))}>
        <dl>{topics.map((topic) => {
          const [name, description] = glossary[topic];
          return <div key={topic}><dt>{t(name)}</dt><dd>{t(description)}</dd></div>;
        })}</dl>
      </div>
    </>
  );
}

export function SessionTime({ date, timeframe, compact }) {
  const content = consolidationSessionLabel(date, timeframe, compact);
  return consolidationSessionDate(date, timeframe) ? <time dateTime={date}>{content}</time> : content;
}

export function LocationBadge({ location }) {
  const { t } = useTranslation();
  return <span className="consolidation-location" data-location={location}>{t(locationLabels[location])}</span>;
}

export function ConsolidationZones({ pick }) {
  const { t } = useTranslation();
  return (
    <dl className="consolidation-zones">
      {[['support', 'Zona support'], ['resistance', 'Zona resistance']].map(([key, label]) => {
        const zone = pick[key];
        return (
          <div key={key} data-zone={key}>
            <dt>{t(label)}</dt>
            <dd><strong>{consolidationZoneLabel(zone, pick.currency)}</strong></dd>
            <dd className="consolidation-reactions">
              {validCount(zone?.touches)
                ? t(zone.touches === 1 ? '1 reaksi terdeteksi' : '{0} reaksi terdeteksi', countFormat.format(zone.touches))
                : t('Jumlah reaksi belum tersedia')}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function consolidationDuration(pick, timeframe, t) {
  if (!validCount(pick.duration) || pick.duration === 0) return t('Tidak tersedia');
  return t(durationUnits[timeframe] ?? durationUnits.daily, countFormat.format(pick.duration));
}

export function pricePositionText(position, t) {
  const { pct } = position;
  if (pct == null) return t('Tidak tersedia');
  // Keep the displayed side of an edge when two decimals round to the edge.
  const boundary = [0, locationBounds.support, locationBounds.resistance, 100]
    .find(value => pct !== value && Math.abs(pct - value) < 0.005);
  const sign = boundary == null ? '' : pct < boundary ? '<' : '>';
  return sign + t('{0}%', positionFormat.format(boundary ?? pct));
}

export function consolidationExplanation(position, t) {
  switch (position.location) {
    case 'support': return t('Harga tutup acuan berada di sisi support, dekat area tempat penurunan sebelumnya mendapat respons.');
    case 'middle': return t('Harga tutup acuan berada di bagian tengah rentang, di antara sisi support dan resistance.');
    case 'resistance': return t('Harga tutup acuan mendekati sisi resistance. Status ini menunjukkan posisi harga di dalam rentang.');
    case 'outside': return t(position.side === 'below'
      ? 'Harga tutup acuan berada di bawah batas luar support.'
      : 'Harga tutup acuan berada di atas batas luar resistance.');
    default: return t('Posisi harga memerlukan harga tutup dan dua zona yang valid.');
  }
}
