import useTranslation from '../useTranslation.js';
import { hasWatchlistCategory, watchlistCategories } from '../watchlist.js';

export default function ScannerWatchAction({ symbol, entry, category, disabled, saving, onAdd }) {
  const { t } = useTranslation();
  const added = category ? hasWatchlistCategory(entry, category) : Boolean(entry);
  const label = category
    ? t(added ? '{0} sudah dipantau di kategori {1}' : 'Pantau {0} di kategori {1}', symbol, t(watchlistCategories[category]))
    : t(added ? '{0} sudah dipantau' : 'Pantau {0}', symbol);
  return (
    <button
      type="button"
      className={added ? 'research-watch research-watch--added' : 'research-watch'}
      disabled={disabled || saving || added}
      onClick={() => onAdd(symbol, category)}
      aria-busy={saving || undefined}
      aria-label={saving ? t('Menyimpan {0} ke Pantauan', symbol) : label}
    >
      {t(added ? 'Dipantau' : saving ? 'Menyimpan…' : 'Pantau')}
    </button>
  );
}
