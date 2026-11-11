import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth, firebaseSetupError } from './firebase.js';
import ThemeToggle from './components/ThemeToggle.jsx';
import WorkspaceIcon from './components/WorkspaceIcon.jsx';

const App = lazy(() => import('./App.jsx'));

const authErrors = {
  'auth/invalid-email': 'Masukkan alamat email yang valid.',
  'auth/invalid-credential': 'Email atau password tidak sesuai.',
  'auth/user-not-found': 'Email atau password tidak sesuai.',
  'auth/wrong-password': 'Email atau password tidak sesuai.',
  'auth/email-already-in-use': 'Email ini sudah terdaftar. Masuk atau gunakan reset password.',
  'auth/weak-password': 'Password belum memenuhi ketentuan akun. Gunakan password yang lebih kuat.',
  'auth/password-does-not-meet-requirements': 'Password belum memenuhi ketentuan akun. Gunakan password yang lebih kuat.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  'auth/network-request-failed': 'Koneksi terputus. Periksa internet lalu coba lagi.',
  'auth/user-disabled': 'Akun ini dinonaktifkan. Hubungi pengelola aplikasi.',
  'auth/operation-not-allowed': 'Login email belum tersedia. Hubungi pengelola aplikasi.',
  'auth/invalid-api-key': 'Layanan login belum siap. Hubungi pengelola aplikasi.',
};

function AuthForm() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const registering = mode === 'register';
  const resetting = mode === 'reset';
  const title = resetting ? 'Reset password' : registering ? 'Buat akun' : 'Masuk ke Cek Saham';
  const submitLabel = resetting ? 'Kirim tautan reset' : registering ? 'Daftar dan mulai' : 'Masuk';

  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword('');
    setConfirmation('');
    setError('');
    setNotice('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!auth || submitting.current) return;
    setError('');
    setNotice('');
    if (registering && password !== confirmation) {
      setError('Konfirmasi password harus sama dengan password.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (resetting) {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice('Jika email ini terdaftar, tautan reset password akan dikirim. Periksa kotak masuk dan folder spam.');
      } else if (registering) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (failure) {
      setError(authErrors[failure.code] ?? 'Proses login gagal. Silakan coba lagi.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand-row">
            <span className="brand"><span className="brand-mark"><WorkspaceIcon name="brand" size={21} /></span>Cek Saham</span>
            <ThemeToggle />
          </div>
          <h1 id="auth-title">{title}</h1>
          <p className="auth-description">
            {resetting ? 'Masukkan email akunmu untuk menerima tautan reset.' : 'Akses pantauan, riwayat pencarian, dan jurnal yang tersimpan di akunmu.'}
          </p>
          {!resetting && (
            <div className="auth-tabs" aria-label="Akses akun">
              <button type="button" aria-pressed={!registering} disabled={busy} onClick={() => changeMode('login')}>Masuk</button>
              <button type="button" aria-pressed={registering} disabled={busy} onClick={() => changeMode('register')}>Daftar</button>
            </div>
          )}
          {(firebaseSetupError || error) && <p className="account-message account-message--error" role="alert">{firebaseSetupError || error}</p>}
          {notice && <p className="account-message" role="status">{notice}</p>}
          <form onSubmit={handleSubmit}>
            <fieldset className="auth-fields" disabled={busy || !auth}>
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" autoComplete="email" required maxLength={254}
                placeholder="nama@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              {!resetting && (
                <>
                  <label htmlFor="auth-password">Password</label>
                  <input id="auth-password" type="password" required minLength={registering ? 6 : undefined}
                    autoComplete={registering ? 'new-password' : 'current-password'}
                    value={password} onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={registering ? 'password-hint' : undefined} />
                  {registering && <p className="auth-hint" id="password-hint">Gunakan minimal 6 karakter.</p>}
                </>
              )}
              {registering && (
                <>
                  <label htmlFor="auth-confirmation">Konfirmasi password</label>
                  <input id="auth-confirmation" type="password" autoComplete="new-password" required minLength={6}
                    value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                </>
              )}
              <button type="submit" className="check-button auth-submit">{busy ? 'Memproses…' : submitLabel}</button>
            </fieldset>
          </form>
          <button className="text-button auth-switch" type="button" disabled={busy}
            onClick={() => changeMode(resetting ? 'login' : 'reset')}>
            {resetting ? 'Kembali ke halaman masuk' : 'Lupa password?'}
          </button>
        </section>
      </div>
    </main>
  );
}

export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    }, () => {
      setUser(null);
      setLoading(false);
      setError('Sesi login gagal dimuat. Muat ulang halaman untuk mencoba kembali.');
    });
  }, []);

  if (loading || error) {
    return (
      <main className="auth-page">
        <div className="status-card" role={error ? 'alert' : 'status'}>
          {loading && <span className="spinner" aria-hidden="true" />}
          <p>{error || 'Memeriksa sesi login…'}</p>
          {error && <button type="button" className="text-button" onClick={() => window.location.reload()}>Muat ulang</button>}
        </div>
      </main>
    );
  }

  return user ? (
    <Suspense fallback={<main className="auth-page" role="status">Memuat ruang kerja…</main>}>
      <App key={user.uid} user={user} />
    </Suspense>
  ) : <AuthForm />;
}
