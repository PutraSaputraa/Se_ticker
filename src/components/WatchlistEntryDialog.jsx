import useTranslation from '../useTranslation.js';
import { useEffect, useId, useRef, useState } from 'react';
import { imageContentTypes, imageFileError, maxImageSizeLabel } from '../imageFile.js';
import { maxWatchlistNotesLength, watchlistCategories } from '../watchlist.js';
import { downloadWatchlistImage } from '../watchlistImage.js';
import WorkspaceIcon from './WorkspaceIcon.jsx';

const submitLabels = { categories: 'Simpan kategori', image: 'Unggah gambar', notes: 'Simpan catatan' };

export default function WatchlistEntryDialog({ entry, companyName, mode, account, uid, disabled, onClose, onSaved }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const submitting = useRef(false);
  const titleId = useId();
  const hintId = useId();
  const contextId = useId();
  const imageMode = mode === 'image';
  const categoryMode = mode === 'categories';
  const { symbol, imageId, categories: savedCategories = [], notes: savedNotes = '' } = entry;
  const [notes, setNotes] = useState(savedNotes);
  const [categories, setCategories] = useState(savedCategories);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const company = typeof companyName === 'string' ? companyName.trim() : '';
  const context = company && company !== symbol ? `${symbol} · ${company}` : symbol;
  const categoriesChanged = savedCategories.length !== categories.length || categories.some(category => !savedCategories.includes(category));
  const canSubmit = imageMode ? Boolean(file) : categoryMode ? categoriesChanged : notes.trim() !== savedNotes;

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

  async function closeDialog() {
    const element = dialog.current;
    if (!element?.open || element.hasAttribute('data-closing')) return;
    if (categoryMode) {
      element.setAttribute('data-closing', '');
      const animation = element.getAnimations?.().find(item => item.animationName === 'watchlist-category-exit');
      if (animation) await animation.finished.catch(() => {});
    }
    if (element.isConnected) element.close();
  }

  function handleCancel(event) {
    if (submitting.current || categoryMode) event.preventDefault();
    if (categoryMode && !submitting.current) closeDialog();
  }

  async function save(operation, failureMessage, successMessage) {
    if (disabled || submitting.current || dialog.current?.hasAttribute('data-closing')) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      if (!await operation()) throw new Error(failureMessage);
      await closeDialog();
      onSaved?.(successMessage);
    } catch (failure) {
      setError(failure.message || failureMessage);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    if (imageMode) {
      return save(() => account.saveWatchlistImage(symbol, imageId, file), 'Gambar gagal disimpan. Coba lagi.', `Gambar ${symbol} tersimpan`);
    }
    if (categoryMode) {
      return save(() => account.saveWatchlistCategories(symbol, savedCategories, categories),
        'Kategori gagal disimpan. Coba lagi.', `Kategori ${symbol} tersimpan`);
    }
    return save(() => account.saveWatchlistNotes(symbol, savedNotes, notes), 'Catatan gagal disimpan. Coba lagi.', `Catatan ${symbol} tersimpan`);
  }

  return (
    <dialog ref={dialog} className={`watchlist-dialog${categoryMode ? ' watchlist-dialog--categories' : ''}`}
      aria-labelledby={titleId} aria-describedby={categoryMode ? `${contextId} ${hintId}` : undefined}
      onClose={onClose} onCancel={handleCancel}>
      <form onSubmit={handleSubmit} aria-busy={saving}>
        {categoryMode ? (
          <header className="watchlist-category-dialog-heading">
            <div>
              <h2 id={titleId}>{t('Ubah kategori')}</h2>
              <p id={contextId}>{context}</p>
            </div>
            <button type="button" className="research-watch watchlist-category-close" aria-label={t('Tutup')}
              disabled={saving} onClick={closeDialog}>
              <WorkspaceIcon name="close" size={19} />
            </button>
          </header>
        ) : <h2 id={titleId}>{t(imageMode ? 'Gambar' : 'Catatan')} {symbol}</h2>}
        {imageMode && (
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
        )}
        {categoryMode && (
          <>
            <fieldset className="watchlist-category-options" disabled={disabled || saving}>
              <legend className="visually-hidden">{t('Kategori pantauan')}</legend>
              {Object.entries(watchlistCategories).map(([category, label], index) => (
                <label key={category}>
                  <input type="checkbox" autoFocus={index === 0} checked={categories.includes(category)} onChange={() => setCategories(current => (
                    current.includes(category) ? current.filter(value => value !== category) : [...current, category]
                  ))} />
                  {t(label)}
                </label>
              ))}
            </fieldset>
            <p id={hintId} className="watchlist-category-hint">
              {t('Kategori adalah label pilihanmu di Pantauan. Gunakan Scanner untuk memeriksa sinyal terkini.')}
            </p>
          </>
        )}
        {mode === 'notes' && (
          <label className="research-field">{t("Catatan")}
            <span className="watchlist-note-editor" data-notes={notes}>
              <textarea rows={5} maxLength={maxWatchlistNotesLength} value={notes} disabled={disabled || saving}
                onChange={(event) => setNotes(event.target.value)} />
            </span>
          </label>
        )}
        {error && <p className="watchlist-dialog-error" role="alert">{t(error)}</p>}
        {saving && <p className={categoryMode ? 'visually-hidden' : 'research-form-help'} role="status">{t("Menyimpan perubahan…")}</p>}
        <div className="watchlist-dialog-actions">
          {categoryMode && (
            <button type="button" className="research-watch" disabled={saving} onClick={closeDialog}>{t('Batal')}</button>
          )}
          {(!imageMode || !imageId || file) && (
            <button type="submit" className="scan-button" disabled={disabled || saving || !canSubmit}>
              {t(categoryMode && saving ? 'Menyimpan…' : submitLabels[mode])}
            </button>
          )}
          {imageMode && imageId && (
            <button type="button" className="research-remove" disabled={disabled || saving}
              onClick={() => save(() => account.saveWatchlistImage(symbol, imageId, null), 'Gambar gagal dihapus. Coba lagi.', `Gambar ${symbol} dihapus`)}>{t("Hapus gambar")}</button>
          )}
          {!categoryMode && (
            <button type="button" className="research-watch" disabled={saving} onClick={closeDialog}>{t('Tutup')}</button>
          )}
        </div>
      </form>
    </dialog>
  );
}
