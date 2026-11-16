import { connectStorageEmulator, deleteObject, getBlob, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app, useEmulators } from './firebase.js';

const storage = app?.options.storageBucket ? getStorage(app) : null;
if (storage && useEmulators) connectStorageEmulator(storage, '127.0.0.1', 9199);

export const screenshotStorageReady = Boolean(storage);
export const screenshotContentTypes = ['image/png', 'image/jpeg', 'image/webp'];
export const maxScreenshotBytes = 5_000_000;
export const screenshotStorageUnavailable = 'Penyimpanan screenshot chart belum dikonfigurasi.';

function screenshotRef(uid, tradeId) {
  if (!storage) throw new Error(screenshotStorageUnavailable);
  return ref(storage, `users/${uid}/journal/${tradeId}/chart`);
}

export async function uploadJournalScreenshot(uid, tradeId, file) {
  const reference = screenshotRef(uid, tradeId);
  try {
    await uploadBytes(reference, file, { contentType: file.type, cacheControl: 'private, no-store' });
  } catch (error) {
    throw new Error('Screenshot chart gagal diunggah. Periksa koneksi atau coba lagi.', { cause: error });
  }
}

export function downloadJournalScreenshot(uid, tradeId) {
  return getBlob(screenshotRef(uid, tradeId), maxScreenshotBytes);
}

export async function deleteJournalScreenshot(uid, tradeId) {
  try {
    await deleteObject(screenshotRef(uid, tradeId));
    return true;
  } catch (error) {
    return error.code === 'storage/object-not-found';
  }
}
