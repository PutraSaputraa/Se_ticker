import { useEffect, useState } from 'react';
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { app, auth, useEmulators } from './firebase.js';
import { normalizeAccountData, updateAccountData } from './accountData.js';

const db = getFirestore(app);
if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);

function dataError(error) {
  if (error.code === 'permission-denied') {
    return 'Akses data akun ditolak. Hubungi pengelola aplikasi untuk memeriksa izin akun.';
  }
  if (error.code === 'unauthenticated') return 'Sesi login berakhir. Silakan masuk kembali.';
  return 'Data akun gagal disinkronkan. Periksa koneksi lalu coba lagi.';
}

export default function useAccountData(uid) {
  const [data, setData] = useState(() => normalizeAccountData());
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [pending, setPending] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setReadError('');
    setReady(false);
    let active = true;
    const unsubscribe = onSnapshot(doc(db, 'users', uid), { includeMetadataChanges: true }, (snapshot) => {
      if (!active || snapshot.metadata.fromCache) return;
      setData(normalizeAccountData(snapshot.data()));
      setReady(true);
    }, (error) => {
      if (!active) return;
      setReadError(dataError(error));
      setReady(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, attempt]);

  async function update(change) {
    if (auth.currentUser?.uid !== uid) return false;
    setPending((count) => count + 1);
    setWriteError('');
    try {
      await updateAccountData(db, uid, change);
      return true;
    } catch (error) {
      setWriteError(dataError(error));
      return false;
    } finally {
      setPending((count) => count - 1);
    }
  }

  return {
    ...data,
    ready,
    pending: pending > 0,
    error: readError || writeError,
    readError,
    retry: () => setAttempt((value) => value + 1),
    update,
  };
}
