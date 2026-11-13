import { useId, useState } from 'react';
import { suggestTickers } from '../tickers.js';

export default function TickerField({
  value, onChange, onSelect, knownSymbols, market, className, icon,
  placeholder, describedBy, maxLength, disabled,
}) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const [open, setOpen] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState(null);
  const suggestions = suggestTickers(value, knownSymbols, market);
  const expanded = open && !disabled && suggestions.length > 0;
  const activeIndex = expanded ? suggestions.findIndex(({ symbol }) => symbol === activeSymbol) : -1;
  const active = expanded ? suggestions[activeIndex] : null;

  function dismiss() {
    setOpen(false);
    setActiveSymbol(null);
  }

  function select(symbol) {
    dismiss();
    onSelect(symbol);
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
      const nextIndex = active
        ? (activeIndex + direction + suggestions.length) % suggestions.length
        : direction > 0 ? 0 : suggestions.length - 1;
      setActiveSymbol(suggestions[nextIndex].symbol);
    }
  }

  return (
    <div className={className}>
      <label htmlFor={inputId}>Kode ticker</label>
      <div className={icon ? 'ticker-input ticker-input--icon' : 'ticker-input'}>
        {icon}
        <input
          id={inputId}
          name="ticker"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={active ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveSymbol(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={dismiss}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          disabled={disabled}
          required
        />
        {expanded && (
          <ul id={listId} className="ticker-suggestions" role="listbox" aria-label="Saran ticker">
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
    </div>
  );
}
