export default function ResearchRequestStatus({ title, message, loading = false }) {
  return (
    <div className={`status-card research-request${loading ? '' : ' status-card--error'}`} role={loading ? 'status' : 'alert'}>
      {!loading && <span className="status-mark" aria-hidden="true">!</span>}
      <div>
        <p className="status-title">{title}</p>
        <p>{message}</p>
        {loading && <div className="research-progress" aria-hidden="true" />}
      </div>
    </div>
  );
}
