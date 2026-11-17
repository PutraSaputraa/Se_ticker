import { createAccountImageClient } from './accountImage.js';

export const {
  upload: uploadWatchlistImage,
  download: downloadWatchlistImage,
  remove: deleteWatchlistImage,
} = createAccountImageClient('watchlist-image', 'imageId', 'Gambar pantauan');
