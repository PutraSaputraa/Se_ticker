import useTranslation from '../useTranslation.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import WatchlistTable from '../WatchlistTable.jsx';
import WatchlistEntryDialog from '../components/WatchlistEntryDialog.jsx';
import WorkspaceIcon from '../components/WorkspaceIcon.jsx';
import { AccountChangeError } from '../accountData.js';
import { formatPrice } from '../format.js';
import { setPriceToWatch, setWatchlistRating } from '../watchlist.js';
import '../styles/research.css';

export default function WatchlistPage({ account, uid }) {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(null);
  const editorTrigger = useRef(null);
  const editorSymbol = useRef(null);
  const listTitle = useRef(null);
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
  const result = sync === 'ready' && confirmation;

  useLayoutEffect(() => {
    const trigger = editorTrigger.current;
    if (editor || watchlistDisabled || !trigger) return;
    if (document.activeElement === document.body) {
      const row = [...document.querySelectorAll('[data-watchlist-symbol]')]
        .find((node) => node.dataset.watchlistSymbol === editorSymbol.current);
      const fallback = row?.querySelector('.watchlist-disclosure');
      const target = trigger.isConnected && !trigger.disabled ? trigger : fallback ?? listTitle.current;
      target?.focus({ preventScroll: true });
    }
    // A category change can remove the focused row when the watchlist snapshot arrives.
    if (document.activeElement !== trigger) {
      editorTrigger.current = null;
      editorSymbol.current = null;
    }
  }, [editor, watchlistDisabled, watchlist]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  async function saveWatchlistChange(symbol, change, message) {
    setConfirmation(null);
    try {
      const saved = await account.update((current) => {
        if (!current.watchlist.some((entry) => entry.symbol === symbol)) {
          throw new AccountChangeError('Saham ini sudah dihapus dari pantauan.');
        }
        return { ...current, watchlist: change(current.watchlist) };
      });
      if (saved) setConfirmation({ message });
      return saved;
    } catch (error) {
      setConfirmation({ message: error instanceof AccountChangeError ? error.message : 'Gagal menyimpan perubahan', error: true });
      return false;
    }
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
          <h2 ref={listTitle} tabIndex={-1}>{t("Daftar pantauan")}</h2>
          <span className="research-sync" data-state={result ? result.error ? 'error' : 'saved' : sync} role="status">
            {sync === 'ready' && !result?.error && <WorkspaceIcon name="check" size={15} />}
            {result ? t(result.message) : t(syncLabel)}
          </span>
        </div>
        {watchlist.length > 0 ? (
          <WatchlistTable
            entries={watchlist}
            formatPrice={formatPrice}
            disabled={watchlistDisabled}
            onRemove={account.removeWatchlistSymbol}
            onSetWatchPrice={(symbol, price) =>
              saveWatchlistChange(
                symbol,
                (list) => setPriceToWatch(list, symbol, price),
                `Harga pantauan ${symbol} tersimpan`,
              )
            }
            onSetRating={(symbol, rating) =>
              saveWatchlistChange(
                symbol,
                (list) => setWatchlistRating(list, symbol, rating),
                `${symbol} · ${rating} bintang tersimpan`,
              )
            }
            onEditEntry={(entry, mode, trigger) => {
              editorTrigger.current = trigger;
              editorSymbol.current = entry.symbol;
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
