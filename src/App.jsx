import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useMatch, useNavigationType } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import useAccountData from './useAccountData.js';
import { clearLegacyData, mergeLegacyData, readLegacyData } from './accountData.js';
import BrandMark from './components/BrandMark.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import WorkspaceIcon from './components/WorkspaceIcon.jsx';
import HomePage from './pages/HomePage.jsx';
import StockDetailPage from './pages/StockDetailPage.jsx';
import WatchlistPage from './pages/WatchlistPage.jsx';
import RecommendPage from './pages/RecommendPage.jsx';
import BacktestPage from './pages/BacktestPage.jsx';
import JournalPage from './pages/JournalPage.jsx';

const navigation = [
  { to: '/', name: 'Cari saham', mobile: 'Cari', icon: 'search' },
  { to: '/watchlist', name: 'Pantauan', icon: 'watch' },
  { to: '/rekomendasi', name: 'Rekomendasi', mobile: 'Riset', icon: 'scan' },
  { to: '/uji-strategi', name: 'Uji strategi', mobile: 'Uji strategi', icon: 'test' },
  { to: '/jurnal', name: 'Jurnal', icon: 'journal' },
];

function Brand() {
  return (
    <Link to="/" className="brand">
      <BrandMark />
      Cek Saham
    </Link>
  );
}

function Sidebar() {
  const stock = useMatch('/stock/:symbol');
  return (
    <aside className="workspace-sidebar">
      <Brand />
      <nav className="workspace-nav" aria-label="Menu utama">
        {navigation.map(({ to, name, mobile, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={name}
            className={({ isActive }) => `workspace-nav-link${isActive || (stock && to === '/') ? ' workspace-nav-link--active' : ''}`}
          >
            <WorkspaceIcon name={icon} />
            <span className="workspace-nav-name">{name}</span>
            <span className="workspace-nav-mobile" aria-hidden="true">{mobile ?? name}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function TopBar({ user }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const accountMenu = useRef(null);
  const header = useRef(null);
  const { pathname } = useLocation();
  const stock = useMatch('/stock/:symbol');
  const section = navigation.find(({ to }) => to === pathname) ?? navigation[0];

  // Topbar menempel di atas konten, jadi tinggi aslinya menentukan jarak aman
  // untuk scroll ke anchor. Tinggi berubah mengikuti breakpoint dan ukuran teks.
  useEffect(() => {
    const bar = header.current;
    const root = document.documentElement;
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty('--header-height', `${entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height}px`);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--header-height');
    };
  }, []);

  useEffect(() => {
    function closeOutside(event) {
      const menu = accountMenu.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut(auth);
    } catch {
      setSignOutError('Gagal keluar dari akun. Coba lagi.');
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="workspace-bar" ref={header}>
        <div className="workspace-bar-inner">
          <Brand />
          <div className="workspace-location">
            <span className="workspace-location-icon"><WorkspaceIcon name={stock ? 'test' : section.icon} size={17} /></span>
            <strong>{stock ? 'Detail saham' : section.name}</strong>
          </div>
          <div className="account-controls">
            <ThemeToggle />
            <details className="account-menu" key={pathname} ref={accountMenu}
              onBlur={(event) => {
                if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && event.currentTarget.open) {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary').focus();
                }
              }}>
              <summary>
                <WorkspaceIcon name="account" size={17} />
                <span>Akun</span>
                <span className="account-chevron"><WorkspaceIcon name="chevron" size={14} /></span>
              </summary>
              <div className="account-popover">
                <span className="account-email">{user.email}</span>
                <button type="button" className="account-signout" disabled={signingOut} onClick={handleSignOut}>
                  {signingOut ? 'Keluar…' : 'Keluar'}
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>
      {signOutError && (
        <div className="account-message account-message--error" role="alert">
          <p>{signOutError}</p>
        </div>
      )}
    </>
  );
}

export default function App({ user }) {
  const account = useAccountData(user.uid);
  const [legacy, setLegacy] = useState(readLegacyData);
  const route = useRef(null);
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== 'POP' && !hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname, hash, navigationType]);

  useEffect(() => {
    const content = route.current;
    const style = getComputedStyle(content);
    const duration = Number.parseFloat(style.getPropertyValue('--motion-page'));
    if (!duration) return;
    const animation = content.animate(
      [{ opacity: 0.76, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration, easing: style.getPropertyValue('--motion-ease').trim() },
    );
    return () => animation.cancel();
  }, [pathname]);

  async function importLegacy() {
    if (await account.update((current) => mergeLegacyData(current, legacy))) {
      clearLegacyData();
      setLegacy({ watchlist: [], history: [] });
    }
  }

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">Lewati ke konten</a>
      <Sidebar />
      <div className="workspace-body">
        <TopBar user={user} />
        <main className="workspace" id="workspace-content" tabIndex={-1}>
          {account.error && (
            <div className="account-message account-message--error" role="alert">
              <p>{account.error}</p>
              {account.readError && <button type="button" className="text-button" onClick={account.retry}>Coba lagi</button>}
            </div>
          )}
          {(legacy.watchlist.length > 0 || legacy.history.length > 0) && (
            <div className="legacy-import">
              <p>Data lama di browser ini tersedia. Impor {legacy.watchlist.length} saham pantauan dan {legacy.history.length} riwayat pencarian ke akun {user.email}.</p>
              <button type="button" className="account-signout" disabled={!account.ready || account.pending} onClick={importLegacy}>Impor ke akun</button>
            </div>
          )}

          <div className="workspace-route" ref={route}>
            <Routes>
              <Route path="/" element={<HomePage account={account} />} />
              <Route path="/stock/:symbol" element={<StockDetailPage account={account} />} />
              <Route path="/watchlist" element={<WatchlistPage account={account} uid={user.uid} />} />
              <Route path="/rekomendasi" element={<RecommendPage account={account} />} />
              <Route path="/uji-strategi" element={<BacktestPage />} />
              <Route path="/jurnal" element={<JournalPage account={account} uid={user.uid} />} />
              <Route path="*" element={<HomePage account={account} />} />
            </Routes>
          </div>

          <footer className="source">Data historis dari Yahoo Finance.</footer>
        </main>
      </div>
    </div>
  );
}
