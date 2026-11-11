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
    <button
      type="button"
      className="theme-toggle"
      aria-label="Tema gelap"
      aria-pressed={isDark}
      title={isDark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'}
      onClick={toggleTheme}
    >
      <svg className="theme-toggle-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24"
        width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round">
        <g className="theme-toggle-sun">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </g>
        <path className="theme-toggle-moon" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
      </svg>
    </button>
  );
}
