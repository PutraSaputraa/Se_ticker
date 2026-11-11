import { useState } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  function toggleTheme() {
    const theme = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    setIsDark(theme === 'dark');
    try {
      localStorage.setItem('cek-saham:theme', theme);
    } catch {}
  }

  return (
    <button type="button" className="theme-toggle" aria-pressed={isDark} onClick={toggleTheme}>
      <span className="theme-toggle-indicator" aria-hidden="true" />
      Tema gelap
    </button>
  );
}
