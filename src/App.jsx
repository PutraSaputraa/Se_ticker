import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase.js';
import useAccountData from './useAccountData.js';
import { clearLegacyData, mergeLegacyData, readLegacyData } from './accountData.js';
import HomePage from './pages/HomePage.jsx';
import StockDetailPage from './pages/StockDetailPage.jsx';
import WatchlistPage from './pages/WatchlistPage.jsx';
import RecommendPage from './pages/RecommendPage.jsx';
import BacktestPage from './pages/BacktestPage.jsx';
import JournalPage from './pages/JournalPage.jsx';

function TopBar({ user }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

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
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand brand--link">
            <span className="brand-mark">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 17 5.5-5.5 3.5 3.5 7-8m-5 0h5v5" />
              </svg>
            </span>
            Cek Saham
          </NavLink>
          <nav className="topnav" aria-label="Menu utama">
            <NavLink to="/" end className={({ isActive }) => `topnav-link${isActive ? ' topnav-link--active' : ''}`}>
              Cari
            </NavLink>
            <NavLink to="/watchlist" className={({ isActive }) => `topnav-link${isActive ? ' topnav-link--active' : ''}`}>
              Pantauan
            </NavLink>
            <NavLink to="/rekomendasi" className={({ isActive }) => `topnav-link${isActive ? ' topnav-link--active' : ''}`}>
              Rekomendasi
            </NavLink>
            <NavLink to="/uji-strategi" className={({ isActive }) => `topnav-link${isActive ? ' topnav-link--active' : ''}`}>
              Uji Strategi
            </NavLink>
            <NavLink to="/jurnal" className={({ isActive }) => `topnav-link${isActive ? ' topnav-link--active' : ''}`}>
              Jurnal
            </NavLink>
          </nav>
          <div className="account-controls">
            <span className="account-email" title={user.email}>{user.email}</span>
            <button type="button" className="account-signout" disabled={signingOut} onClick={handleSignOut}>
              {signingOut ? 'Keluar…' : 'Keluar'}
            </button>
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

  async function importLegacy() {
    if (await account.update((current) => mergeLegacyData(current, legacy))) {
      clearLegacyData();
      setLegacy({ watchlist: [], history: [] });
    }
  }

  return (
    <>
      <TopBar user={user} />
      <main className="workspace">
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
          <Route path="/" element={<HomePage history={account.history} />} />
          <Route path="/stock/:symbol" element={<StockDetailPage account={account} />} />
          <Route path="/watchlist" element={<WatchlistPage account={account} />} />
          <Route path="/rekomendasi" element={<RecommendPage account={account} />} />
          <Route path="/uji-strategi" element={<BacktestPage />} />
          <Route path="/jurnal" element={<JournalPage account={account} />} />
          <Route path="*" element={<HomePage history={account.history} />} />
        </Routes>

        <footer className="source">Data historis dari Yahoo Finance.</footer>
      </main>
    </>
  );
}
