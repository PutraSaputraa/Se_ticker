import { Link } from 'react-router-dom';
import useTranslation from '../useTranslation.js';
import useJournalSetups from '../useJournalSetups.js';
import { formatPrice } from '../format.js';
import { journalSides } from '../journal.js';
import { levelPrecision } from '../journalLevels.js';
import WorkspaceIcon from '../components/WorkspaceIcon.jsx';
import '../styles/dashboard.css';

function DashboardCard({ id, title, icon, rows, message, to, action }) {
  const { t } = useTranslation();
  return (
    <section className="dashboard-card" aria-labelledby={id}>
      <header className="dashboard-card-header">
        <h2 id={id}><WorkspaceIcon name={icon} size={19} />{t(title)}</h2>
        {to && <Link className="dashboard-card-action" to={to}>{t(action)}<WorkspaceIcon name="arrow" size={16} /></Link>}
      </header>
      {rows.length > 0 ? (
        <ul className="dashboard-list">
          {rows.map(({ key, symbol, direction, limit }) => (
            <li key={key}>
              <Link to={`/stock/${encodeURIComponent(symbol)}`}>
                <span className="dashboard-list-ticker">
                  <strong>{symbol}</strong>
                  {direction && <span className="dashboard-setup-direction">{t(direction)}</span>}
                </span>
                {limit && <span className="dashboard-setup-limit">{limit}</span>}
                <WorkspaceIcon name="arrow" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="dashboard-empty" role="status">{t(message)}</p>}
    </section>
  );
}

export default function DashboardPage({ account, uid }) {
  const { t } = useTranslation();
  const { watchlist, history, ready, readError } = account;
  const { setups, loading, failed } = useJournalSetups(uid);
  const watched = watchlist.slice(0, 8).map(({ symbol }) => ({ key: symbol, symbol }));
  const recent = history.map(symbol => ({ key: symbol, symbol }));
  const pending = setups.slice(0, 3).map(({ id, pair, side, limitPrice, quoteCurrency, triggerAbove }) => ({
    key: id,
    symbol: pair,
    direction: journalSides[side]?.label,
    limit: Number.isFinite(limitPrice) && quoteCurrency
      ? `${triggerAbove ? '≥' : '≤'} ${formatPrice(limitPrice, quoteCurrency, levelPrecision)}`
      : null,
  }));

  return (
    <div className="dashboard-page">
      <header className="page-heading section-accent motion-enter">
        <h1>{t("Dashboard")}</h1>
      </header>
      <div className="dashboard-grid motion-enter motion-enter--after">
        <DashboardCard
          id="dashboard-watchlist"
          title="Pantauan"
          icon="watch"
          rows={watched}
          to="/watchlist"
          action="Buka pantauan"
          message={readError ? "Pantauan gagal dimuat." : ready ? "Belum ada saham dalam pantauan." : "Memuat pantauan…"}
        />
        <DashboardCard
          id="dashboard-setups"
          title="Trade setup aktif"
          icon="journal"
          rows={pending}
          to="/jurnal#journal-setups"
          action="Buka jurnal"
          message={failed ? "Setup gagal dimuat." : loading ? "Memuat setup…" : "Belum ada setup yang menunggu."}
        />
        <DashboardCard
          id="dashboard-history"
          title="Pencarian terakhir"
          icon="history"
          rows={recent}
          message={readError ? "Riwayat gagal dimuat." : ready ? "Cari ticker untuk mulai mengisi riwayat." : "Memuat riwayat akun…"}
        />
      </div>
    </div>
  );
}
