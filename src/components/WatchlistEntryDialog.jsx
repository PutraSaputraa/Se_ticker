import { useEffect, useId, useRef, useState } from 'react';
import { imageContentTypes, imageFileError, maxImageSizeLabel } from '../imageFile.js';
import { maxWatchlistNotesLength } from '../watchlist.js';
import { downloadWatchlistImage } from '../watchlistImage.js';

export default function WatchlistEntryDialog({ entry, mode, account, uid, disabled, onClose }) {
  const dialog = useRef(null);
  const submitting = useRef(false);
  const titleId = useId();
  const hintId = useId();
  const imageMode = mode === 'image';
  const { symbol, imageId, notes: savedNotes = '' } = entry;
  const [notes, setNotes] = useState(savedNotes);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    setPreview(null);
    if (!imageMode || (!imageId && !file)) return;
    let active = true;
    let url;
    async function load() {
      try {
        const blob = file ?? await downloadWatchlistImage(uid, imageId);
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreview({ url });
      } catch (failure) {
        if (active) setPreview({ error: failure.message });
      }
    }
    load();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, imageId, imageMode, uid]);

  function selectImage(event) {
    const selected = event.currentTarget.files[0] ?? null;
    const message = imageFileError(selected);
    if (message) event.currentTarget.value = '';
    setFile(message ? null : selected);
    setError(message);
  }

  async function save(operation, failureMessage) {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      if (!await operation()) throw new Error(failureMessage);
      dialog.current?.close();
    } catch (failure) {
      setError(failure.message || failureMessage);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (imageMode) {
      if (file) save(() => account.saveWatchlistImage(symbol, imageId, file), 'Gambar gagal disimpan. Coba lagi.');
    } else if (notes.trim() !== savedNotes) {
      save(() => account.saveWatchlistNotes(symbol, savedNotes, notes), 'Catatan gagal disimpan. Coba lagi.');
    }
  }

  return (
    <dialog ref={dialog} className="watchlist-dialog" aria-labelledby={titleId} onClose={onClose}
      onCancel={(event) => { if (submitting.current) event.preventDefault(); }}>
      <form onSubmit={handleSubmit} aria-busy={saving}>
        <h2 id={titleId}>{imageMode ? 'Gambar' : 'Catatan'} {symbol}</h2>
        {imageMode ? (
          <>
            {preview?.url && <img src={preview.url} alt={file ? `Pratinjau gambar ${symbol}` : `Gambar pantauan ${symbol}`} />}
            {preview?.error && <p className="watchlist-dialog-error" role="alert">{preview.error}</p>}
            {imageId && !preview && !file && <p className="research-form-help" role="status">Memuat gambar…</p>}
            <label className="research-field">
              {imageId ? 'Ganti gambar' : 'Pilih gambar'}
              <input type="file" accept={imageContentTypes.join(',')} aria-describedby={hintId}
                onChange={selectImage} disabled={disabled || saving} />
            </label>
            <p className="research-form-help" id={hintId}>
              PNG, JPG, atau WebP hingga {maxImageSizeLabel}. Unggahan disimpan sebagai WebP.
            </p>
          </>
        ) : (
          <label className="research-field">
            Catatan
            <textarea rows={5} maxLength={maxWatchlistNotesLength} value={notes} disabled={disabled || saving}
              onChange={(event) => setNotes(event.target.value)} />
          </label>
        )}
        {error && <p className="watchlist-dialog-error" role="alert">{error}</p>}
        {saving && <p className="research-form-help" role="status">Menyimpan perubahan…</p>}
        <div className="watchlist-dialog-actions">
          {(!imageMode || !imageId || file) && (
            <button type="submit" className="scan-button"
              disabled={disabled || saving || (imageMode ? !file : notes.trim() === savedNotes)}>
              {imageMode ? 'Unggah gambar' : 'Simpan catatan'}
            </button>
          )}
          {imageMode && imageId && (
            <button type="button" className="research-remove" disabled={disabled || saving}
              onClick={() => save(() => account.saveWatchlistImage(symbol, imageId, null), 'Gambar gagal dihapus. Coba lagi.')}>
              Hapus gambar
            </button>
          )}
          <button type="button" className="research-watch" disabled={saving} onClick={() => dialog.current.close()}>Tutup</button>
        </div>
      </form>
    </dialog>
  );
}
