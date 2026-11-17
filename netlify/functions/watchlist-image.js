import { createAccountImageHandler } from './shared/accountImage.js';

export default createAccountImageHandler({
  idParam: 'imageId',
  storeName: 'watchlist-images',
  keyFor: (uid, id) => `users/${uid}/watchlist/${id}`,
  label: 'Gambar pantauan',
  service: 'gambar pantauan',
  invalidId: 'ID gambar tidak valid.',
  duplicateMessage: 'Gambar pantauan ini sudah tersimpan.',
});
