import { useEffect, useId, useRef, useState } from 'react';
import useTranslation from '../useTranslation.js';
import { accountTickerSymbols } from '../tickers.js';
import SearchForm from './SearchForm.jsx';
import WorkspaceIcon from './WorkspaceIcon.jsx';

export default function NavbarSearch({ initialTicker, account }) {
  const { t } = useTranslation();
  const panelId = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const input = useRef(null);
  const [open, setOpen] = useState(initialTicker !== null);

  useEffect(() => {
    if (!open) return;

    input.current?.focus({ preventScroll: true });
    function dismissOutside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  function closeAndFocus() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    if (!open || event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    closeAndFocus();
  }

  return (
    <div
      ref={root}
      className="navbar-search"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="workspace-nav-link navbar-search-trigger"
        aria-label={t("Cari saham")}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(current => !current)}
      >
        <WorkspaceIcon name="search" size={18} />
        <span className="workspace-nav-name">{t("Cari saham")}</span>
        <span className="workspace-nav-mobile" aria-hidden="true">{t("Cari")}</span>
      </button>
      {open && (
        <>
          <div className="navbar-search-backdrop" aria-hidden="true" onClick={closeAndFocus} />
          <div className="navbar-search-panel" id={panelId}>
            <SearchForm
              initialTicker={initialTicker ?? ''}
              knownSymbols={accountTickerSymbols(account)}
              inputRef={input}
              onSelect={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
