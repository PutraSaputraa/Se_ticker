import { useId, useState } from 'react';
import { suggestJournalTickers } from '../journalTickers.js';

export default function JournalTickerField({ value, onChange, knownSymbols, disabled }) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = suggestJournalTickers(value, knownSymbols);
  const expanded = open && !disabled && suggestions.length > 0;
  const active = expanded ? suggestions[activeIndex] : null;

  function dismiss() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function select(symbol) {
    onChange(symbol, symbol);
    dismiss();
  }

  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      dismiss();
    } else if (event.key === 'Enter' && active) {
      event.preventDefault();
      select(active.symbol);
    } else if (suggestions.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActiveIndex(active
        ? (activeIndex + direction + suggestions.length) % suggestions.length
        : direction > 0 ? 0 : suggestions.length - 1);
    }
  }

  return (
    <div className="journal-ticker-field">
      <label htmlFor={inputId}>Kode ticker</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={active ? `${listId}-${activeIndex}` : undefined}
        aria-describedby="journal-ticker-note"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={dismiss}
        onKeyDown={handleKeyDown}
        placeholder="BBCA, NVDA, BTC-USD"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={39}
        disabled={disabled}
        required
      />
      {expanded && (
        <ul id={listId} className="journal-ticker-suggestions" role="listbox" aria-label="Saran ticker">
          {suggestions.map(({ symbol, market }, index) => (
            <li
              key={symbol}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(symbol)}
            >
              <strong>{symbol}</strong>
              {market && <span>{market}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
