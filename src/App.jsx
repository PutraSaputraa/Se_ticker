import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useMatch, useNavigationType } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import useAccountData from './useAccountData.js';
import { clearLegacyData, mergeLegacyData, readLegacyData } from './accountData.js';
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
      <span className="brand-mark"><WorkspaceIcon name="brand" size={21} /></span>
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
  const { pathname } = useLocation();
  const stock = useMatch('/stock/:symbol');
  const section = navigation.find(({ to }) => to === pathname)?.name ?? 'Cari saham';

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
      <header className="workspace-bar">
        <div className="workspace-bar-inner">
          <Brand />
          <div className="workspace-location">
            <strong>{stock ? 'Detail saham' : section}</strong>
          </div>
          <div className="account-controls">
            <ThemeToggle />
            <details className="account-menu" key={pathname}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && event.currentTarget.open) {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary').focus();
                }
              }}>
              <summary><WorkspaceIcon name="account" size={17} /><span>Akun</span></summary>
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
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);

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

          <Routes>
            <Route path="/" element={<HomePage account={account} />} />
            <Route path="/stock/:symbol" element={<StockDetailPage account={account} />} />
            <Route path="/watchlist" element={<WatchlistPage account={account} />} />
            <Route path="/rekomendasi" element={<RecommendPage account={account} />} />
            <Route path="/uji-strategi" element={<BacktestPage />} />
            <Route path="/jurnal" element={<JournalPage account={account} />} />
            <Route path="*" element={<HomePage account={account} />} />
          </Routes>

          <footer className="source">Data historis dari Yahoo Finance.</footer>
        </main>
      </div>
    </div>
  );
}
