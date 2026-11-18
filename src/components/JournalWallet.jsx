import { localizedDateFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';
import { useState } from 'react';
import { formatPnl, formatPrice } from '../format.js';
import { walletMovementLabels } from '../wallet.js';
import TableScroll from './TableScroll.jsx';

const movementDate = localizedDateFormat({ dateStyle: 'medium', timeStyle: 'medium' });

export default function JournalWallet({ wallet, ready, readError, disabled, saving, onMove, children }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const kind = event.nativeEvent.submitter?.value || 'deposit';
    if (await onMove(kind, amount)) setAmount('');
  }

  return (
    <section id="journal-wallet" className="journal-section journal-wallet" aria-labelledby="journal-wallet-title">
      <div className="journal-section-header motion-enter motion-enter--after">
        <div>
          <h2 id="journal-wallet-title" tabIndex={-1}>{t("Wallet jurnal")}</h2>
          <p className="journal-help">{t("Catat dana dalam USD untuk mendanai posisi baru.")}</p>
        </div>
        <a href="#journal-charts" className="journal-secondary-button">{t("Lihat grafik")}</a>
      </div>
      {ready ? (
        <>
          <dl className="journal-wallet-totals">
            <div>
              <dt>{t("Saldo tersedia")}</dt>
              <dd className={wallet.availableCents < 0 ? 'trend--down' : undefined}>{formatPrice(wallet.availableCents / 100, 'USD')}</dd>
            </div>
            <div><dt>{t("Dana di posisi")}</dt><dd>{formatPrice(wallet.reservedCents / 100, 'USD')}</dd></div>
            <div><dt>{t("Ekuitas tercatat")}</dt><dd>{formatPrice(wallet.equityCents / 100, 'USD')}</dd></div>
          </dl>
          <form className="journal-form journal-wallet-form" onSubmit={handleSubmit} aria-busy={saving}>
            <label>{t("Jumlah wallet (USD)")}<input type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)}
                placeholder={t("150 atau 125,50")} maxLength={17} disabled={disabled} required />
            </label>
            <div className="journal-wallet-actions">
              <button type="submit" value="deposit" className="scan-button" disabled={disabled}>{t("Tambah saldo")}</button>
              <button type="submit" value="withdraw" className="journal-secondary-button" disabled={disabled || wallet.availableCents <= 0}>{t("Tarik saldo")}</button>
            </div>
          </form>
          {children}
          {wallet.history.length > 0 && (
            <details className="journal-pnl-days">
              <summary>{t("Riwayat wallet")}</summary>
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
                        <td className="num">{formatPnl(movement.cashDelta / 100, 'USD')}</td>
                        <td className="num">{formatPrice(movement.availableCents / 100, 'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </details>
          )}
        </>
      ) : <p className="journal-help" role="status">{readError ? t("Wallet gagal dimuat.") : t("Memuat saldo wallet…")}</p>}
    </section>
  );
}
