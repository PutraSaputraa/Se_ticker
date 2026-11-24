import { useEffect, useId, useRef, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import useTranslation from '../useTranslation.js';

export default function UsernameDialog({ user, username, onClose }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const field = useRef(null);
  const submitting = useRef(false);
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const name = draft.trim();

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || name === username) return;
    if (!name) {
      setError('Username wajib diisi.');
      field.current.focus();
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      await updateProfile(user, { displayName: name });
      dialog.current?.close();
    } catch {
      setError('Username gagal disimpan. Coba lagi.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className="username-dialog" aria-labelledby={titleId} onClose={onClose}
      onCancel={event => { if (submitting.current) event.preventDefault(); }}>
      <form onSubmit={handleSubmit} aria-busy={saving} noValidate>
        <h2 id={titleId}>{t('Ubah username')}</h2>
        <div>
          <label htmlFor={inputId}>Username</label>
          <input id={inputId} ref={field} type="text" dir="auto" autoComplete="nickname" required
            aria-invalid={error && !name ? true : undefined} aria-describedby={error ? errorId : undefined}
            value={draft} disabled={saving} onChange={event => {
              setDraft(event.target.value);
              setError('');
            }} />
        </div>
        {error && <p className="username-error" id={errorId} role="alert">{t(error)}</p>}
        <div className="username-actions">
          <button type="button" className="text-button" disabled={saving} onClick={() => dialog.current.close()}>{t('Batal')}</button>
          <button type="submit" className="check-button" disabled={saving || name === username}>
            {t(saving ? 'Menyimpan…' : 'Simpan')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
