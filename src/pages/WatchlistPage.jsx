import useTranslation from '../useTranslation.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WatchlistTable from '../WatchlistTable.jsx';
import WatchlistEntryDialog from '../components/WatchlistEntryDialog.jsx';
import WorkspaceIcon from '../components/WorkspaceIcon.jsx';
import { formatPrice } from '../format.js';
import { setPriceToWatch, setWatchlistRating } from '../watchlist.js';
import '../styles/research.css';

export default function WatchlistPage({ account, uid }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editor, setEditor] = useState(null);
  const editorTrigger = useRef(null);
  const [confirmation, setConfirmation] = useState(null);
  const { watchlist } = account;
  const watchlistDisabled = !account.ready || account.pending;
  const sync = account.pending ? 'pending' : account.error ? 'error' : account.ready ? 'ready' : 'loading';
  const syncLabel = {
    pending: 'Menyimpan perubahan…',
    error: account.readError ? 'Gagal memuat data akun' : 'Gagal menyimpan perubahan',
    ready: 'Tersinkron dengan akun',
    loading: 'Memuat data akun…',
  }[sync];
  const justSaved = sync === 'ready' && confirmation;

  useLayoutEffect(() => {
    if (editor || watchlistDisabled) return;
    const trigger = editorTrigger.current;
    editorTrigger.current = null;
    if (trigger?.isConnected && document.activeElement === document.body) {
      trigger.focus({ preventScroll: true });
    }
  }, [editor, watchlistDisabled]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  async function saveWatchlistChange(change, message) {
    const saved = await account.update((current) => ({ ...current, watchlist: change(current.watchlist) }));
    if (saved) setConfirmation({ message });
    return saved;
  }

  return (
    <div className="research-workspace watchlist-page">
      <header className="page-heading page-heading--identity research-heading watchlist-heading motion-enter">
        <div>
          <h1>{t("Pantauan saham")}</h1>
          <p>{t("Bandingkan harga penutupan, volume, dan kriteria Stage 2.")}</p>
        </div>
        <Link className="scan-button" to="/">{t("Cari saham")}</Link>
      </header>

      <section className="research-panel watchlist-panel" aria-label={t("Daftar pantauan")}>
        <div className="research-panel-heading watchlist-toolbar motion-enter motion-enter--after">
          {watchlist.length > 0 && (
            <div>
              <strong>{watchlist.length} {t("saham")}</strong>
              <p>{t("Bintang tertinggi di atas")}</p>
            </div>
          )}
          <span className="research-sync" data-state={justSaved ? 'saved' : sync} role="status">
            {sync === 'ready' && <WorkspaceIcon name="check" size={15} />}
            {justSaved ? t(confirmation.message) : t(syncLabel)}
          </span>
        </div>
        {watchlist.length > 0 ? (
          <WatchlistTable
            entries={watchlist}
            formatPrice={formatPrice}
            disabled={watchlistDisabled}
            onOpen={(symbol) => navigate(`/stock/${encodeURIComponent(symbol)}`)}
            onRemove={account.removeWatchlistSymbol}
            onSetWatchPrice={(symbol, price) =>
              saveWatchlistChange(
                (list) => setPriceToWatch(list, symbol, price),
                `Harga pantauan ${symbol} tersimpan`,
              )
            }
            onSetRating={(symbol, rating) =>
              saveWatchlistChange(
                (list) => setWatchlistRating(list, symbol, rating),
                `${symbol} · ${rating} bintang tersimpan`,
              )
            }
            onEditEntry={(entry, mode, trigger) => {
              editorTrigger.current = trigger;
              setEditor({ entry, mode });
            }}
          />
        ) : account.ready ? (
          <div className="research-empty">
            <h2>{t("Belum ada saham dipantau")}</h2>
            <p>{t("Cari ticker, buka detail saham, lalu pilih Pantau.")}</p>
          </div>
        ) : (
          <p className="research-empty">{account.readError ? t("Daftar pantauan tersedia setelah sinkronisasi berhasil.") : t("Mengambil daftar saham yang tersimpan di akunmu.")}</p>
        )}
      </section>
      {editor && (
        <WatchlistEntryDialog {...editor} account={account} uid={uid} disabled={watchlistDisabled}
          onSaved={(message) => setConfirmation({ message })}
          onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
