import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage, t } from './i18n.js';

export default function useTranslation() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'id');
  return { language, t };
}
