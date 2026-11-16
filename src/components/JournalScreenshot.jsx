import { useEffect, useId, useRef, useState } from 'react';
import { downloadJournalScreenshot } from '../journalScreenshot.js';
import { maxScreenshotBytes, screenshotContentTypes } from '../journalScreenshotFile.js';

const maxSizeLabel = `${maxScreenshotBytes / 1_000_000} MB`;

export function JournalScreenshotField({ file, onChange, disabled }) {
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
    let message = '';
    if (selected && !screenshotContentTypes.includes(selected.type)) {
      message = 'Pilih gambar dalam format PNG, JPG, atau WebP.';
    } else if (selected && (selected.size === 0 || selected.size > maxScreenshotBytes)) {
      message = `Pilih gambar dengan ukuran di atas 0 hingga ${maxSizeLabel}.`;
    }
    if (message) event.currentTarget.value = '';
    setError(message);
    onChange(message ? null : selected ?? null);
  }

  return (
    <div className="journal-screenshot-field">
      <label htmlFor={inputId}>Screenshot chart (opsional)</label>
      <div className="journal-screenshot-picker">
        <span className="journal-secondary-button" aria-hidden="true">Pilih gambar</span>
        <span className="journal-screenshot-filename" aria-hidden="true">{file?.name ?? 'Belum ada gambar'}</span>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={screenshotContentTypes.join(',')}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          onChange={selectFile}
          disabled={disabled}
        />
      </div>
      <p className="journal-help" id={hintId}>
        PNG, JPG, atau WebP hingga {maxSizeLabel}.
      </p>
      {error && <p className="journal-feedback journal-feedback--error" id={errorId} role="alert">{error}</p>}
      {file && preview && (
        <>
          <img src={preview} alt="Pratinjau screenshot chart" className="journal-screenshot-preview" />
          <button type="button" className="text-button journal-screenshot-button" disabled={disabled} onClick={() => {
            input.current.value = '';
            onChange(null);
            input.current.focus();
          }}>
            Lepas gambar
          </button>
        </>
      )}
    </div>
  );
}

export function JournalScreenshotDialog({ uid, trade, onClose }) {
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
        <h2 id={titleId}>Screenshot chart {trade.pair}</h2>
        <button type="button" className="journal-secondary-button" onClick={() => dialog.current.close()}>Tutup</button>
      </div>
      {result?.url && <img src={result.url} alt={`Screenshot chart ${trade.pair}`} />}
      {!result && <p className="journal-help" role="status">Memuat screenshot chart…</p>}
      {result?.message && (
        <div className="journal-feedback journal-feedback--error">
          <p role="alert">{result.message}</p>
          <button className="text-button journal-screenshot-button" type="button" onClick={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}>
            Coba lagi
          </button>
        </div>
      )}
    </dialog>
  );
}
