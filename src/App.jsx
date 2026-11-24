import useTranslation from './useTranslation.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import useAccountData from './useAccountData.js';
import { clearLegacyData, mergeLegacyData, readLegacyData } from './accountData.js';
import BrandMark from './components/BrandMark.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import LanguageSwitcher from './components/LanguageSwitcher.jsx';
import NavbarSearch from './components/NavbarSearch.jsx';
import SupportButton from './components/SupportButton.jsx';
import UsernameDialog from './components/UsernameDialog.jsx';
import WorkspaceIcon from './components/WorkspaceIcon.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import StockDetailPage from './pages/StockDetailPage.jsx';
import WatchlistPage from './pages/WatchlistPage.jsx';
import RecommendPage from './pages/RecommendPage.jsx';
import JournalPage from './pages/JournalPage.jsx';

const navigation = [
  { to: '/', name: 'Dashboard', icon: 'dashboard' },
  { to: '/watchlist', name: 'Pantauan', icon: 'watch' },
  { action: 'search' },
  { to: '/rekomendasi', name: 'Rekomendasi', mobile: 'Riset', icon: 'scan' },
  { to: '/jurnal', name: 'Jurnal', icon: 'journal' },
];

function Brand() {
  const { t } = useTranslation();
  const name = t("Cek Saham");
  return (
    <Link to="/" className="brand" aria-label={name}>
      <BrandMark />
      <span className="workspace-brand-name">{name}</span>
    </Link>
  );
}

function placeNavHighlight(nav, highlight, slide) {
  const link = nav.querySelector('a[aria-current="page"]');
  const anchor = highlight.offsetParent;
  if (!link || !anchor) {
    nav.removeAttribute('data-highlight-active');
    return;
  }

  // Use the existing positioned ancestor so the Search panel keeps its anchor.
  const item = link.getBoundingClientRect();
  const host = anchor.getBoundingClientRect();
  const x = item.left - host.left - anchor.clientLeft;
  const y = item.top - host.top - anchor.clientTop;
  Object.assign(highlight.style, {
    width: item.width + 'px',
    height: item.height + 'px',
    transform: 'translate(' + x + 'px, ' + y + 'px)',
  });
  highlight.toggleAttribute('data-sliding', slide);
  nav.setAttribute('data-highlight-active', '');
}

function WorkspaceNav({ account, initialTicker, searchKey }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const nav = useRef(null);
  const highlight = useRef(null);

  useLayoutEffect(() => {
    placeNavHighlight(nav.current, highlight.current, true);
  }, [pathname]);

  useEffect(() => {
    const menu = nav.current;
    const marker = highlight.current;
    const observer = new ResizeObserver(() => placeNavHighlight(menu, marker, false));
    observer.observe(menu.closest('.workspace-bar'));
    observer.observe(menu);
    menu.querySelectorAll(':scope > a').forEach(link => observer.observe(link));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="workspace-nav" ref={nav} aria-label={t("Menu utama")}>
      <span className="workspace-nav-highlight" ref={highlight} aria-hidden="true" />
      {navigation.map(({ to, name, mobile, icon, action }) => action === 'search' ? (
        <NavbarSearch key={`search-${searchKey}`} initialTicker={initialTicker} account={account} />
      ) : (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          aria-label={t(name)}
          className={({ isActive }) => `workspace-nav-link${isActive ? ' workspace-nav-link--active' : ''}`}
        >
          <WorkspaceIcon name={icon} />
          <span className="workspace-nav-name">{t(name)}</span>
          <span className="workspace-nav-mobile" aria-hidden="true">{t(mobile ?? name)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function TopBar({ user, account }) {
  const { t } = useTranslation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [editingUsername, setEditingUsername] = useState(false);
  const accountMenu = useRef(null);
  const header = useRef(null);
  const { pathname, search, key } = useLocation();
  const initialTicker = pathname === '/' ? new URLSearchParams(search).get('ticker') : null;
  const username = user.displayName?.trim() || 'User1';

  useLayoutEffect(() => {
    if (accountMenu.current.open) accountMenu.current.open = false;
  }, [pathname]);

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

  function editUsername() {
    const menu = accountMenu.current;
    menu.open = false;
    menu.querySelector('summary').focus({ preventScroll: true });
    setEditingUsername(true);
  }

  return (
    <>
      <header className="workspace-bar" ref={header}>
        <div className="workspace-bar-inner">
          <Brand />
          <WorkspaceNav searchKey={key} initialTicker={initialTicker} account={account} />
          <div className="account-controls">
            <LanguageSwitcher />
            <SupportButton />
            <ThemeToggle />
            <details className="account-menu" ref={accountMenu}
              onToggle={(event) => {
                const menu = event.currentTarget;
                menu.querySelector('.account-popover').inert = !menu.open;
              }}
              onBlur={(event) => {
                if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && event.currentTarget.open) {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary').focus();
                }
              }}>
              <summary aria-label={username} title={username}>
                <WorkspaceIcon name="account" size={17} />
                <span className="account-name" dir="auto">{username}</span>
                <span className="account-chevron"><WorkspaceIcon name="chevron" size={14} /></span>
              </summary>
              <div className="account-popover" inert>
                <div className="account-profile">
                  <strong dir="auto">{username}</strong>
                  <span className="account-email">{user.email}</span>
                </div>
                <button type="button" className="text-button account-edit-username" aria-haspopup="dialog"
                  disabled={signingOut} onClick={editUsername}>
                  <WorkspaceIcon name="edit" size={16} /> {t('Ubah username')}
                </button>
                <button type="button" className="account-signout" disabled={signingOut} onClick={handleSignOut}>
                  {signingOut ? t("Keluar…") : t("Keluar")}
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>
      {editingUsername && <UsernameDialog user={user} username={username} onClose={() => setEditingUsername(false)} />}
      {signOutError && (
        <div className="account-message account-message--error" role="alert">
          <p>{t(signOutError)}</p>
        </div>
      )}
    </>
  );
}

export default function App({ user }) {
  const { t } = useTranslation();
  const account = useAccountData(user.uid);
  const [legacy, setLegacy] = useState(readLegacyData);
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== 'POP' && !hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname, hash, navigationType]);

  async function importLegacy() {
    if (await account.update((current) => mergeLegacyData(current, legacy))) {
      clearLegacyData();
      setLegacy({ watchlist: [], history: [] });
    }
  }

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">{t("Lewati ke konten")}</a>
      <TopBar user={user} account={account} />
      <main className="workspace" id="workspace-content" tabIndex={-1}>
        {account.error && (
          <div className="account-message account-message--error" role="alert">
            <p>{t(account.error)}</p>
            {account.readError && <button type="button" className="text-button" onClick={account.retry}>{t("Coba lagi")}</button>}
          </div>
        )}
        {(legacy.watchlist.length > 0 || legacy.history.length > 0) && (
          <div className="legacy-import">
            <p>{t("Data lama di browser ini tersedia. Impor")} {legacy.watchlist.length} {t("saham pantauan dan")} {legacy.history.length} {t("riwayat pencarian ke akun")} {user.email}.</p>
            <button type="button" className="account-signout" disabled={!account.ready || account.pending} onClick={importLegacy}>{t("Impor ke akun")}</button>
          </div>
        )}

        <div className="workspace-route">
          <Routes>
            <Route path="/" element={<DashboardPage account={account} uid={user.uid} />} />
            <Route path="/stock/:symbol" element={<StockDetailPage account={account} />} />
            <Route path="/watchlist" element={<WatchlistPage account={account} uid={user.uid} />} />
            <Route path="/rekomendasi" element={<RecommendPage account={account} />} />
            <Route path="/screener" element={<Navigate to="/" replace />} />
            <Route path="/jurnal" element={<JournalPage account={account} uid={user.uid} />} />
            <Route path="*" element={<DashboardPage account={account} uid={user.uid} />} />
          </Routes>
        </div>

        <footer className="source">{t("Data historis dari Yahoo Finance.")}</footer>
      </main>
    </div>
  );
}
