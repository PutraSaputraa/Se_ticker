import useTranslation from '../useTranslation.js';

export default function ScannerWatchAction({ symbol, inWatchlist, disabled, onAdd }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={inWatchlist ? 'research-watch research-watch--added' : 'research-watch'}
      disabled={disabled || inWatchlist}
      onClick={() => onAdd(symbol)}
      aria-label={inWatchlist ? t("{0} sudah dipantau", symbol) : t("Pantau {0}", symbol)}
    >
      {inWatchlist ? t("Dipantau") : t("Pantau")}
    </button>
  );
}
