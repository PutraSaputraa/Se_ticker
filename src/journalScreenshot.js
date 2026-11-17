import { createAccountImageClient } from './accountImage.js';

export const {
  upload: uploadJournalScreenshot,
  download: downloadJournalScreenshot,
  remove: deleteJournalScreenshot,
} = createAccountImageClient('journal-screenshot', 'tradeId', 'Screenshot chart');
