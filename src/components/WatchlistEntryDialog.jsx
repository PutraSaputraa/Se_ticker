import useTranslation from '../useTranslation.js';
import { useEffect, useId, useRef, useState } from 'react';
import { imageContentTypes, imageFileError, maxImageSizeLabel } from '../imageFile.js';
import { maxWatchlistNotesLength } from '../watchlist.js';
import { downloadWatchlistImage } from '../watchlistImage.js';

export default function WatchlistEntryDialog({ entry, mode, account, uid, disabled, onClose, onSaved }) {
  const { t } = useTranslation();
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

  async function save(operation, failureMessage, successMessage) {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      if (!await operation()) throw new Error(failureMessage);
      onSaved(successMessage);
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
      if (file) save(() => account.saveWatchlistImage(symbol, imageId, file), 'Gambar gagal disimpan. Coba lagi.', `Gambar ${symbol} tersimpan`);
    } else if (notes.trim() !== savedNotes) {
      save(() => account.saveWatchlistNotes(symbol, savedNotes, notes), 'Catatan gagal disimpan. Coba lagi.', `Catatan ${symbol} tersimpan`);
    }
  }

  return (
    <dialog ref={dialog} className="watchlist-dialog" aria-labelledby={titleId} onClose={onClose}
      onCancel={(event) => { if (submitting.current) event.preventDefault(); }}>
      <form onSubmit={handleSubmit} aria-busy={saving}>
        <h2 id={titleId}>{imageMode ? t("Gambar") : t("Catatan")} {symbol}</h2>
        {imageMode ? (
          <>
            {preview?.url && (
              <img src={preview.url} alt={file ? t("Pratinjau gambar {0}", symbol) : t("Gambar pantauan {0}", symbol)}
                onError={() => setPreview({ error: 'Gambar gagal ditampilkan.' })} />
            )}
            {preview?.error && <p className="watchlist-dialog-error" role="alert">{t(preview.error)}</p>}
            {imageId && !preview && !file && <p className="research-form-help" role="status">{t("Memuat gambar…")}</p>}
            <label className="research-field">
              {imageId ? t("Ganti gambar") : t("Pilih gambar")}
              <span className="watchlist-file-picker">
                <span className="research-watch" aria-hidden="true">{t("Pilih file")}</span>
                <span aria-hidden="true">{file?.name ?? t("Belum ada file")}</span>
                <input type="file" accept={imageContentTypes.join(',')} aria-describedby={hintId}
                  onChange={selectImage} disabled={disabled || saving} />
              </span>
            </label>
            <p className="research-form-help" id={hintId}>{t("PNG, JPG, atau WebP hingga")} {maxImageSizeLabel}{t(". Unggahan disimpan sebagai WebP.")}</p>
          </>
        ) : (
          <label className="research-field">{t("Catatan")}<textarea rows={5} maxLength={maxWatchlistNotesLength} value={notes} disabled={disabled || saving}
              onChange={(event) => setNotes(event.target.value)} />
          </label>
        )}
        {error && <p className="watchlist-dialog-error" role="alert">{t(error)}</p>}
        {saving && <p className="research-form-help" role="status">{t("Menyimpan perubahan…")}</p>}
        <div className="watchlist-dialog-actions">
          {(!imageMode || !imageId || file) && (
            <button type="submit" className="scan-button"
              disabled={disabled || saving || (imageMode ? !file : notes.trim() === savedNotes)}>
              {imageMode ? t("Unggah gambar") : t("Simpan catatan")}
            </button>
          )}
          {imageMode && imageId && (
            <button type="button" className="research-remove" disabled={disabled || saving}
              onClick={() => save(() => account.saveWatchlistImage(symbol, imageId, null), 'Gambar gagal dihapus. Coba lagi.', `Gambar ${symbol} dihapus`)}>{t("Hapus gambar")}</button>
          )}
          <button type="button" className="research-watch" disabled={saving} onClick={() => dialog.current.close()}>{t("Tutup")}</button>
        </div>
      </form>
    </dialog>
  );
}
