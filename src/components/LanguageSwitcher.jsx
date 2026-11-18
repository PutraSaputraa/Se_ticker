import { useEffect } from 'react';
import useTranslation from '../useTranslation.js';
import { languageStorageKey, setLanguage } from '../i18n.js';

export default function LanguageSwitcher() {
  const { language, t } = useTranslation();
  return (
    <div className="language-switcher" role="group" aria-label={t('Bahasa')}>
      <button type="button" lang="id" aria-label="Bahasa Indonesia" aria-pressed={language === 'id'}
        onClick={() => setLanguage('id')}>ID</button>
      <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}>EN</button>
    </div>
  );
}

export function LanguageSettings() {
  const { language } = useTranslation();
  useEffect(() => {
    setLanguage(language);
    function sync(event) {
      if (event.key === languageStorageKey || event.key === null) setLanguage(event.newValue === 'en' ? 'en' : 'id');
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [language]);
  return null;
}
