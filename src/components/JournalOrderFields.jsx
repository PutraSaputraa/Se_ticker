import { formatPrice } from '../format.js';
import { journalRewardMultiples, parseJournalLeverage } from '../journal.js';
import { journalStopLossPercentages } from '../journalLevels.js';
import { parseWalletUsd } from '../wallet.js';

export function PriceField({ label, value, onChange, describedBy, disabled, readOnly = false }) {
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        maxLength={25}
        disabled={disabled}
        readOnly={readOnly}
        required={!readOnly}
      />
    </label>
  );
}

export function ExitPlanFields({ form, levels, setField, disabled, describedBy }) {
  const { stopLossPct, rewardMultiple } = form;
  return (
    <>
      <label>
        Metode Stop Loss
        <select value={stopLossPct} onChange={(event) => setField('stopLossPct', event.target.value)} aria-describedby={describedBy} disabled={disabled}>
          <option value="">Isi sendiri</option>
          {journalStopLossPercentages.map((percent) => <option key={percent} value={percent}>{percent}% otomatis</option>)}
        </select>
      </label>
      <PriceField label="Stop Loss" value={stopLossPct ? levels.stopLoss : form.stopLoss}
        onChange={(value) => setField('stopLoss', value)} describedBy={describedBy} disabled={disabled} readOnly={Boolean(stopLossPct)} />
      <label>
        Risk Reward Ratio
        <select value={rewardMultiple} onChange={(event) => setField('rewardMultiple', event.target.value)} disabled={disabled}>
          <option value="">Isi TP sendiri</option>
          {journalRewardMultiples.map((multiple) => <option key={multiple} value={multiple}>1:{multiple}</option>)}
        </select>
      </label>
      <PriceField label="Take Profit (TP)" value={rewardMultiple ? levels.takeProfit : form.takeProfit}
        onChange={(value) => setField('takeProfit', value)} describedBy={describedBy} disabled={disabled} readOnly={Boolean(rewardMultiple)} />
    </>
  );
}

export function LeverageFields({ form, setField, disabled }) {
  const marginCents = parseWalletUsd(form.positionUsd);
  const leverage = parseJournalLeverage(form.leverage, marginCents);
  const positionValue = leverage == null ? '' : formatPrice(marginCents * leverage / 100, 'USD');

  return (
    <div className="journal-leverage-fields">
      <label>
        Leverage (×)
        <input type="text" inputMode="decimal" value={form.leverage}
          onChange={(event) => setField('leverage', event.target.value)} disabled={disabled} required />
      </label>
      <label>
        Nilai posisi setelah leverage (USD)
        <input type="text" value={positionValue} placeholder="–" disabled={disabled} readOnly />
      </label>
      <p className="journal-help">Nilai posisi awal menjadi margin wallet. PnL memakai nilai posisi setelah leverage.</p>
    </div>
  );
}
