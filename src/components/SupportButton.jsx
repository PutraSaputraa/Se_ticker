import { useEffect, useId, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import useTranslation from '../useTranslation.js';
import '../styles/support.css';

const walletAddress = import.meta.env.VITE_SUPPORT_WALLET_ADDRESS?.trim() ?? '';
const hasWalletAddress = /^0x[0-9a-fA-F]{40}$/.test(walletAddress) && !/^0x0{40}$/.test(walletAddress);

function SupportDialog({ address, onClose }) {
  const { t } = useTranslation();
  const dialog = useRef(null);
  const addressField = useRef(null);
  const titleId = useId();
  const instructionsId = useId();
  const addressId = useId();
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyStatus(t("Alamat disalin."));
    } catch {
      addressField.current?.focus();
      addressField.current?.select();
      setCopyStatus(t("Salin alamat yang sudah dipilih secara manual."));
    }
  }

  return (
    <dialog ref={dialog} className="support-dialog" aria-labelledby={titleId} aria-describedby={instructionsId} onClose={onClose}>
      <div className="support-dialog-header">
        <h2 id={titleId}>{t("Dukung Dev")}</h2>
        <button type="button" className="text-button" onClick={() => dialog.current.close()}>{t("Tutup")}</button>
      </div>
      <div className="support-transfer">
        <div>
          <h3>{t("USDC di jaringan Base")}</h3>
          <p id={instructionsId}>{t("Pilih aset dan jaringan ini di wallet pengirim, lalu pindai QR atau salin alamat.")}</p>
        </div>
        <QRCodeCanvas value={address} size={185} level="M" marginSize={4} className="support-qr" aria-hidden="true" />
      </div>
      <div className="support-address">
        <label htmlFor={addressId}>{t("Alamat penerima")}</label>
        <textarea id={addressId} ref={addressField} value={address} dir="ltr" rows={2} readOnly spellCheck={false} />
      </div>
      <button className="scan-button support-copy" type="button" onClick={copyAddress}>{t("Salin alamat")}</button>
      <p className="support-copy-status" role="status">{copyStatus}</p>
    </dialog>
  );
}

export default function SupportButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const control = useRef(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!hasWalletAddress) return;
    function dismissTooltip(event) {
      if (event.key === 'Escape' && control.current?.matches(':hover, :focus-within')) {
        control.current.setAttribute('data-tooltip-dismissed', '');
      }
    }
    document.addEventListener('keydown', dismissTooltip);
    return () => document.removeEventListener('keydown', dismissTooltip);
  }, []);

  if (!hasWalletAddress) return null;

  const label = t("Dukung Dev");

  function resetTooltip(event) {
    event.currentTarget.removeAttribute('data-tooltip-dismissed');
  }

  return (
    <>
      <div className="support-control" ref={control} data-open={open || undefined}
        onPointerEnter={resetTooltip} onFocus={resetTooltip}>
        <button type="button" className="support-trigger" aria-label={label} aria-describedby={tooltipId}
          aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <svg className="support-coffee" width="26" height="29" viewBox="0 0 26 29" fill="none"
            stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <g className="support-steam" strokeWidth="1.15">
              <path d="M8 12c-3-3 3-4 0-7" />
              <path d="M13 12c-3-3 3-4 0-7" />
              <path d="M17.5 12c-2.5-2.5 2.5-3.5 0-6" />
            </g>
            <g className="support-cup">
              <path d="M5 14h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" fill="currentColor" stroke="none" />
              <path d="M19 15.5h1.5a2.5 2.5 0 1 1 0 5H18.5M5.5 25.5h14" strokeWidth="1.6" />
            </g>
          </svg>
        </button>
        <span className="support-tooltip" id={tooltipId} role="tooltip">{t("Traktir kopi untuk developer ☕")}</span>
      </div>
      {open && <SupportDialog address={walletAddress} onClose={() => setOpen(false)} />}
    </>
  );
}
