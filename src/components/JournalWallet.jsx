import { localizedDateFormat, localizedNumberFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import { useState } from 'react';
import { formatPnl, formatPrice } from '../format.js';
import { walletMovementLabels } from '../wallet.js';
import TableScroll from './TableScroll.jsx';

const movementDate = localizedDateFormat({ dateStyle: 'medium', timeStyle: 'medium' });
const allocationPercent = localizedNumberFormat({ style: 'percent', maximumFractionDigits: 2 });

function CapitalAllocation({ wallet }) {
  const { t } = useTranslation();
  if (wallet.availableCents < 0 || wallet.reservedCents < 0) {
    return <p className="journal-help">{t("Alokasi tidak ditampilkan saat saldo wallet atau dana di posisi negatif.")}</p>;
  }
  if (wallet.equityCents === 0) return <p className="journal-help">{t("Belum ada dana untuk ditampilkan dalam alokasi.")}</p>;

  const available = wallet.availableCents / wallet.equityCents;
  const reserved = wallet.reservedCents / wallet.equityCents;
  return (
    <div className="journal-allocation">
      <div className="journal-allocation-labels">
        <span>{t("Tersedia {0}", allocationPercent.format(available))}</span>
        <span>{t("Di posisi {0}", allocationPercent.format(reserved))}</span>
      </div>
      <div className="journal-allocation-track" aria-hidden="true">
        <div style={{ '--allocation-available': available * 100 + '%' }} />
      </div>
    </div>
  );
}

export default function JournalWallet({ wallet, ready, readError, disabled, saving, onMove, onViewChart, children }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [movementKind, setMovementKind] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    const kind = event.nativeEvent.submitter?.value || 'deposit';
    setMovementKind(kind);
    try {
      if (await onMove(kind, amount)) setAmount('');
    } finally {
      setMovementKind(null);
    }
  }

  return (
    <section id="journal-wallet" className="journal-section journal-wallet" aria-labelledby="journal-wallet-title">
      <div className="journal-section-header motion-enter motion-enter--after">
        <div>
          <h2 id="journal-wallet-title" tabIndex={-1}>{t("Wallet jurnal")}</h2>
          <p className="journal-help">{t("Catat dana dalam USD untuk mendanai posisi baru.")}</p>
        </div>
        {ready && <a href="#journal-charts" className="journal-secondary-button" onClick={onViewChart}>{t("Lihat grafik")}</a>}
      </div>
      {ready ? (
        <>
          <dl className="journal-wallet-totals" aria-describedby="journal-equity-note">
            <div>
              <dt>{t("Saldo tersedia")}</dt>
              <dd className={wallet.availableCents < 0 ? 'trend--down' : undefined}>
                {wallet.availableCents < 0 ? formatPnl(wallet.availableCents / 100, 'USD') : formatPrice(wallet.availableCents / 100, 'USD')}
              </dd>
            </div>
            <div><dt>{t("Dana di posisi")}</dt><dd>{formatPrice(wallet.reservedCents / 100, 'USD')}</dd></div>
            <div><dt>{t("Ekuitas tercatat")}</dt><dd>{formatPrice(wallet.equityCents / 100, 'USD')}</dd></div>
          </dl>
          <CapitalAllocation wallet={wallet} />
          <details className="journal-inline-help">
            <summary>{t("Basis ekuitas")}</summary>
            <p className="journal-help" id="journal-equity-note">{t("Ekuitas tercatat adalah saldo tersedia ditambah dana yang tercatat di posisi. PnL berjalan ditampilkan terpisah di Posisi terbuka.")}</p>
          </details>
          <form className="journal-form journal-wallet-form" onSubmit={handleSubmit} aria-busy={saving}>
            <label>{t("Jumlah wallet (USD)")}<input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)}
                placeholder={t("150 atau 125,50")} maxLength={17} disabled={disabled} required />
            </label>
            <div className="journal-wallet-actions">
              <button type="submit" value="deposit" className="scan-button" disabled={disabled}>
                {saving && movementKind === 'deposit' ? t("Menambah saldo…") : t("Tambah saldo")}
              </button>
              <button type="submit" value="withdraw" className="journal-secondary-button" disabled={disabled || wallet.availableCents <= 0}>
                {saving && movementKind === 'withdraw' ? t("Menarik saldo…") : t("Tarik saldo")}
              </button>
            </div>
          </form>
          {children}
          <details className="journal-pnl-days">
            <summary>{t("Riwayat wallet")}</summary>
            {wallet.history.length > 0 ? (
              <TableScroll className="journal-table-wrap" label={t("Riwayat wallet USD")}>
                <table className="fund-table journal-wallet-history">
                  <thead>
                    <tr><th scope="col">{t("Waktu")}</th><th scope="col">{t("Aktivitas")}</th><th scope="col" className="num">{t("Perubahan saldo")}</th><th scope="col" className="num">{t("Saldo tersedia")}</th></tr>
                  </thead>
                  <tbody>
                    {[...wallet.history].reverse().map((movement) => (
                      <tr key={movement.id}>
                        <td><time dateTime={new Date(movement.at).toISOString()}>{movementDate.format(movement.at)}</time></td>
                        <th scope="row">
                          {t(walletMovementLabels[movement.kind])}{movement.symbol ? ` ${movement.symbol}` : ''}
                          {movement.kind === 'close' && (
                            <small className="journal-trade-note">{t("PnL")} {formatPnl((movement.cashDelta + movement.reservedDelta) / 100, 'USD')}</small>
                          )}
                        </th>
                        <td className={movement.cashDelta > 0 ? 'num trend--up' : movement.cashDelta < 0 ? 'num trend--down' : 'num'}>
                          {formatPnl(movement.cashDelta / 100, 'USD')}
                        </td>
                        <td className="num">{formatPrice(movement.availableCents / 100, 'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            ) : <p className="journal-help">{t("Belum ada aktivitas wallet.")}</p>}
          </details>
        </>
      ) : <p className="journal-help" role="status">{readError ? t("Wallet gagal dimuat.") : t("Memuat saldo wallet…")}</p>}
    </section>
  );
}
