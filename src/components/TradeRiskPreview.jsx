import { formatPnl, formatPrice } from '../format.js';
import { localizedNumberFormat } from '../i18n.js';
import useTranslation from '../useTranslation.js';

const number = localizedNumberFormat({ maximumFractionDigits: 2 });
const percent = localizedNumberFormat({ style: 'percent', maximumFractionDigits: 2 });

export default function TradeRiskPreview({ form, levels, risk, equityCents }) {
  const { t } = useTranslation();
  const { loss, profit, reward, capitalAtRisk, positionCents, leverage } = risk;
  let help;
  if (positionCents == null || !levels.entryPrice) help = 'Isi nilai posisi USD dan harga masuk untuk melihat estimasi.';
  else if (leverage == null) help = 'Isi margin dan leverage yang valid untuk menghitung risiko futures.';
  else if (loss == null || profit == null) help = 'Isi Stop Loss dan Take Profit yang sesuai dengan arah posisi.';
  else if (!(equityCents > 0)) help = 'Persentase risiko memerlukan ekuitas wallet tercatat yang positif.';

  function estimate(value) {
    if (value == null) return '–';
    if (Math.abs(value) < 0.000001) return t("Kurang dari {0}", formatPrice(0.000001, 'USD', 6));
    return formatPnl(value, 'USD', Math.abs(value) < 0.01 ? 6 : undefined);
  }

  return (
    <section className="journal-risk-preview" aria-labelledby="journal-risk-title">
      <h3 id="journal-risk-title">{t("Pratinjau risiko posisi")}</h3>
      <dl className="journal-risk-values">
        <div><dt>{t("Potensi rugi")}</dt><dd className={loss == null ? undefined : 'trend--down'}>{estimate(loss == null ? null : -loss)}</dd></div>
        <div><dt>{t("Potensi untung")}</dt><dd className={profit == null ? undefined : 'trend--up'}>{estimate(profit)}</dd></div>
        <div>
          <dt>{t("Risiko / imbal hasil")}</dt>
          <dd>{!Number.isFinite(reward) ? '–' : reward < 0.01 ? '1:<0.01' : '1:' + number.format(reward)}</dd>
        </div>
        <div>
          <dt>{t("Risiko terhadap ekuitas")}</dt>
          <dd>{!Number.isFinite(capitalAtRisk) ? '–' : capitalAtRisk < 0.0001 ? '<' + percent.format(0.0001) : percent.format(capitalAtRisk)}</dd>
        </div>
      </dl>
      {help && <p className="journal-help">{t(help)}</p>}
      <p className="journal-help">{form.type === 'futures'
        ? t("Estimasi linear memakai margin dan leverage yang diisi. Persentase risiko dihitung terhadap ekuitas wallet tercatat (USD).")
        : t("Estimasi memakai nilai awal posisi. Persentase risiko dihitung terhadap ekuitas wallet tercatat (USD).")}</p>
      <details className="journal-inline-help">
        <summary>{t("Asumsi estimasi")}</summary>
        <p className="journal-help">{t("Estimasi memakai level harga yang diisi dan asumsi kurs tetap. Biaya, perubahan kurs, slippage, dan likuidasi tidak dihitung.")}</p>
      </details>
    </section>
  );
}
