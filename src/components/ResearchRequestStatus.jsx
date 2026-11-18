import useTranslation from '../useTranslation.js';
export function ResearchProgress() {
  return <span className="research-progress" aria-hidden="true" />;
}

export default function ResearchRequestStatus({ title, message, loading = false }) {
  const { t } = useTranslation();
  return (
    <div className={`status-card research-request motion-status${loading ? '' : ' status-card--error'}`} role={loading ? 'status' : 'alert'}>
      {!loading && <span className="status-mark" aria-hidden="true">!</span>}
      <div>
        <p className="status-title">{t(title)}</p>
        <p>{t(message)}</p>
        {loading && <ResearchProgress />}
      </div>
    </div>
  );
}
