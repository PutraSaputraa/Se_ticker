import { auth } from './firebase.js';
import { imageContentTypes, imageFileError, maxImageBytes, maxImageSizeLabel } from './imageFile.js';

const webpType = 'image/webp';
const maxImageEdge = 2048;
const preferredWebpBytes = 1_500_000;

function encodeWebp(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((image) => {
      if (image?.type === webpType && image.size > 0) resolve(image);
      else reject(new Error('Browser gagal mengonversi gambar ke WebP.'));
    }, webpType, quality);
  });
}

async function prepareUploadImage(file) {
  if (!file) throw new Error('Pilih gambar untuk diunggah.');
  const validation = imageFileError(file);
  if (validation) throw new Error(validation);
  if (file.type === webpType) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new Error('Gambar gagal dibaca. Pilih file PNG atau JPG yang valid.', { cause });
  }

  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, maxImageEdge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser gagal memproses gambar.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }

  let image = await encodeWebp(canvas, 0.86);
  if (image.size > preferredWebpBytes) image = await encodeWebp(canvas, 0.74);
  if (image.size > maxImageBytes) throw new Error(`Ukuran gambar setelah kompresi melebihi ${maxImageSizeLabel}.`);
  return image;
}

async function imageError(response, fallback) {
  const result = await response.json().catch(() => null);
  return new Error(typeof result?.error === 'string' ? result.error : fallback);
}

export function createAccountImageClient(endpoint, idParam, label) {
  async function request(uid, id, method, file) {
    const user = auth?.currentUser;
    if (!user || user.uid !== uid) throw new Error('Sesi login berakhir. Silakan masuk kembali.');

    try {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
      if (file) headers['Content-Type'] = file.type;
      const params = new URLSearchParams({ [idParam]: id });
      return await fetch(`/.netlify/functions/${endpoint}?${params}`, {
        method, body: file, headers, signal: AbortSignal.timeout(25_000),
      });
    } catch (error) {
      throw new Error(`Koneksi ke penyimpanan ${label.toLowerCase()} gagal. Coba lagi.`, { cause: error });
    }
  }

  return {
    async upload(uid, id, file) {
      const image = await prepareUploadImage(file);
      const response = await request(uid, id, 'PUT', image);
      if (response.status !== 201) throw await imageError(response, `${label} gagal diunggah. Coba lagi.`);
    },
    async download(uid, id) {
      const response = await request(uid, id, 'GET');
      if (response.status !== 200 || !imageContentTypes.includes(response.headers.get('content-type'))) {
        throw await imageError(response, `${label} gagal dibuka.`);
      }
      return response.blob();
    },
    async remove(uid, id) {
      try {
        const response = await request(uid, id, 'DELETE');
        return response.status === 204;
      } catch {
        return false;
      }
    },
  };
}
