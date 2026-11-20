import useTranslation from '../useTranslation.js';
import { useId } from 'react';
import { formatPrice } from '../format.js';
import { journalRewardMultiples, parseJournalLeverage } from '../journal.js';
import { journalStopLossPercentages } from '../journalLevels.js';
import { parseWalletUsd } from '../wallet.js';

export function PriceField({ label, value, onChange, describedBy, error, disabled, readOnly = false }) {
  const { t } = useTranslation();
  const errorId = useId();
  return (
    <label>
      {t(label)}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t(label)}
        aria-describedby={[describedBy, error && errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        maxLength={25}
        disabled={disabled}
        readOnly={readOnly}
        required={!readOnly}
      />
      {error && <small className="journal-field-error" id={errorId}>{t(error)}</small>}
    </label>
  );
}

export function ExitPlanFields({ form, levels, setField, disabled, describedBy, stopError, targetError }) {
  const { t } = useTranslation();
  const { stopLossPct, rewardMultiple } = form;
  return (
    <>
      <label>{t("Metode Stop Loss")}<select value={stopLossPct} onChange={(event) => setField('stopLossPct', event.target.value)} aria-describedby={describedBy} disabled={disabled}>
          <option value="">{t("Isi sendiri")}</option>
          {journalStopLossPercentages.map((percent) => <option key={percent} value={percent}>{percent}{t("% otomatis")}</option>)}
        </select>
      </label>
      <PriceField label={t("Stop Loss")} value={stopLossPct ? levels.stopLoss : form.stopLoss}
        onChange={(value) => setField('stopLoss', value)} describedBy={describedBy} error={stopError} disabled={disabled} readOnly={Boolean(stopLossPct)} />
      <label>{t("Risk Reward Ratio")}<select value={rewardMultiple} onChange={(event) => setField('rewardMultiple', event.target.value)} disabled={disabled}>
          <option value="">{t("Isi TP sendiri")}</option>
          {journalRewardMultiples.map((multiple) => <option key={multiple} value={multiple}>1:{multiple}</option>)}
        </select>
      </label>
      <PriceField label={t("Take Profit (TP)")} value={rewardMultiple ? levels.takeProfit : form.takeProfit}
        onChange={(value) => setField('takeProfit', value)} describedBy={describedBy} error={targetError} disabled={disabled} readOnly={Boolean(rewardMultiple)} />
    </>
  );
}

export function LeverageFields({ form, setField, disabled }) {
  const { t } = useTranslation();
  const marginCents = parseWalletUsd(form.positionUsd);
  const leverage = parseJournalLeverage(form.leverage, marginCents);
  const positionValue = leverage == null ? '' : formatPrice(marginCents * leverage / 100, 'USD');

  return (
    <div className="journal-leverage-fields">
      <label>{t("Leverage (×)")}<input type="text" inputMode="decimal" value={form.leverage}
          onChange={(event) => setField('leverage', event.target.value)} disabled={disabled} required />
      </label>
      <label>{t("Nilai posisi setelah leverage (USD)")}<input type="text" value={positionValue} placeholder={"–"} disabled={disabled} readOnly />
      </label>
      <p className="journal-help">{t("Nilai posisi awal menjadi margin wallet. PnL memakai nilai posisi setelah leverage.")}</p>
    </div>
  );
}
