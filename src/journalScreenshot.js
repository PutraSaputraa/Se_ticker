import { auth } from './firebase.js';
import { screenshotContentTypes } from './journalScreenshotFile.js';

async function requestScreenshot(uid, tradeId, method, file) {
  const user = auth?.currentUser;
  if (!user || user.uid !== uid) throw new Error('Sesi login berakhir. Silakan masuk kembali.');

  try {
    const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
    if (file) headers['Content-Type'] = file.type;
    const params = new URLSearchParams({ tradeId });
    return await fetch(`/.netlify/functions/journal-screenshot?${params}`, { method, body: file, headers });
  } catch (error) {
    throw new Error('Koneksi ke penyimpanan screenshot gagal. Coba lagi.', { cause: error });
  }
}

async function screenshotError(response, fallback) {
  const result = await response.json().catch(() => null);
  return new Error(typeof result?.error === 'string' ? result.error : fallback);
}

export async function uploadJournalScreenshot(uid, tradeId, file) {
  const response = await requestScreenshot(uid, tradeId, 'PUT', file);
  if (response.status !== 201) {
    throw await screenshotError(response, 'Screenshot chart gagal diunggah. Coba lagi.');
  }
}

export async function downloadJournalScreenshot(uid, tradeId) {
  const response = await requestScreenshot(uid, tradeId, 'GET');
  if (response.status !== 200 || !screenshotContentTypes.includes(response.headers.get('content-type'))) {
    throw await screenshotError(response, 'Screenshot chart gagal dibuka.');
  }
  return response.blob();
}

export async function deleteJournalScreenshot(uid, tradeId) {
  try {
    const response = await requestScreenshot(uid, tradeId, 'DELETE');
    return response.status === 204;
  } catch {
    return false;
  }
}
