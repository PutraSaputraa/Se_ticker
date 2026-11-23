import { useEffect, useId, useRef, useState } from 'react';
import useTranslation from '../useTranslation.js';
import { accountTickerSymbols } from '../tickers.js';
import SearchForm from './SearchForm.jsx';
import WorkspaceIcon from './WorkspaceIcon.jsx';

export default function NavbarSearch({ initialTicker, account }) {
  const { t } = useTranslation();
  const searchLabel = t("Cari saham");
  const panelId = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const input = useRef(null);
  const [open, setOpen] = useState(initialTicker !== null);
  const [formKey, setFormKey] = useState(initialTicker !== null ? 1 : 0);

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

  function toggleSearch() {
    if (open) {
      closeAndFocus();
    } else {
      setFormKey(current => current + 1);
      setOpen(true);
    }
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
      data-open={open || undefined}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className="workspace-nav-link navbar-search-trigger"
        aria-label={searchLabel}
        title={searchLabel}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggleSearch}
      >
        <WorkspaceIcon name="search" />
      </button>
      <div className="navbar-search-backdrop" aria-hidden="true" onClick={closeAndFocus} />
      <div className="navbar-search-panel" id={panelId} inert={!open}>
        <div className="navbar-search-panel-content">
          {formKey > 0 && (
            <SearchForm
              key={formKey}
              initialTicker={initialTicker ?? ''}
              knownSymbols={accountTickerSymbols(account)}
              inputRef={input}
              onSelect={() => setOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
