import { createAccountImageHandler } from './shared/accountImage.js';

export default createAccountImageHandler({
  idParam: 'tradeId',
  storeName: 'journal-screenshots',
  keyFor: (uid, id) => `users/${uid}/journal/${id}/chart`,
  label: 'Screenshot chart',
  service: 'screenshot',
  invalidId: 'ID posisi tidak valid.',
  duplicateMessage: 'Screenshot untuk posisi ini sudah ada.',
});
