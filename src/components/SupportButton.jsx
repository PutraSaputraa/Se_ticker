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

  if (!hasWalletAddress) return null;

  return (
    <>
      <button type="button" className="support-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t("Dukung Dev")}
      </button>
      {open && <SupportDialog address={walletAddress} onClose={() => setOpen(false)} />}
    </>
  );
}
