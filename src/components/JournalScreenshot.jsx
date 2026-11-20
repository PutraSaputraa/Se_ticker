import useTranslation from '../useTranslation.js';
import { useEffect, useId, useRef, useState } from 'react';
import { downloadJournalScreenshot } from '../journalScreenshot.js';
import { imageContentTypes, imageFileError, maxImageSizeLabel } from '../imageFile.js';
import WorkspaceIcon from './WorkspaceIcon.jsx';

export function JournalScreenshotField({ file, onChange, disabled }) {
  const { t } = useTranslation();
  const input = useRef(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      input.current.value = '';
      setPreview('');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(event) {
    const selected = event.currentTarget.files[0];
    const message = imageFileError(selected);
    if (message) event.currentTarget.value = '';
    setError(message);
    onChange(message ? null : selected ?? null);
  }

  return (
    <div className="journal-screenshot-field">
      <label htmlFor={inputId}>{t("Screenshot chart (opsional)")}</label>
      <div className="journal-screenshot-picker">
        <span className="journal-secondary-button" aria-hidden="true"><WorkspaceIcon name="image" size={16} />{file ? t("Ganti gambar") : t("Unggah chart")}</span>
        <span className="journal-screenshot-filename" aria-hidden="true">{file?.name ?? t("Belum ada gambar")}</span>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={imageContentTypes.join(',')}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onChange={selectFile}
          disabled={disabled}
        />
      </div>
      <p className="journal-help" id={hintId}>{t("PNG, JPG, atau WebP hingga {0}.", maxImageSizeLabel)}</p>
      {error && <p className="journal-feedback journal-feedback--error" id={errorId} role="alert">{t(error)}</p>}
      {file && (
        <>
          {preview && (
            <img src={preview} alt={t("Pratinjau screenshot chart")} className="journal-screenshot-preview"
              onError={() => {
                setPreview('');
                setError('Pratinjau gambar gagal ditampilkan.');
              }} />
          )}
          <button type="button" className="text-button journal-screenshot-button" disabled={disabled} onClick={() => {
            input.current.value = '';
            setError('');
            onChange(null);
            input.current.focus();
          }}>{t("Lepas gambar")}</button>
        </>
      )}
    </div>
  );
}

export function JournalScreenshotDialog({ uid, trade, onClose }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const titleId = useId();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    let url;

    async function loadScreenshot() {
      try {
        const file = await downloadJournalScreenshot(uid, trade.id);
        if (!active) return;
        url = URL.createObjectURL(file);
        setResult({ url });
      } catch (error) {
        if (!active) return;
        setResult({ message: error.message });
      }
    }

    loadScreenshot();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [uid, trade.id, attempt]);

  return (
    <dialog ref={dialog} className="journal-screenshot-dialog" aria-labelledby={titleId} onClose={onClose}>
      <div className="journal-section-header">
        <h2 id={titleId}>{t("Screenshot chart")} {trade.pair}</h2>
        <button type="button" className="journal-secondary-button" onClick={() => dialog.current.close()}>{t("Tutup")}</button>
      </div>
      {result?.url && <img src={result.url} alt={t("Screenshot chart {0}", trade.pair)}
        onError={() => setResult({ message: 'Screenshot chart gagal ditampilkan.' })} />}
      {!result && <p className="journal-help" role="status">{t("Memuat screenshot chart…")}</p>}
      {result?.message && (
        <div className="journal-feedback journal-feedback--error">
          <p role="alert">{t(result.message)}</p>
          <button className="text-button journal-screenshot-button" type="button" onClick={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}>{t("Coba lagi")}</button>
        </div>
      )}
    </dialog>
  );
}
