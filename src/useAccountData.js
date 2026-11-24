import { useEffect, useState } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth } from './firebase.js';
import { db } from './firestore.js';
import { AccountChangeError, normalizeAccountData, updateAccountData } from './accountData.js';
import { addSymbol, removeSymbol, setWatchlistCategories, setWatchlistImage, setWatchlistNotes } from './watchlist.js';
import { deleteWatchlistImage, uploadWatchlistImage } from './watchlistImage.js';

function dataError(error) {
  if (error.code === 'permission-denied') {
    return 'Akses data akun ditolak. Hubungi pengelola aplikasi untuk memeriksa izin akun.';
  }
  if (error.code === 'unauthenticated') return 'Sesi login berakhir. Silakan masuk kembali.';
  return 'Data akun gagal disinkronkan. Periksa koneksi lalu coba lagi.';
}

function requireWatchlistEntry(watchlist, symbol) {
  const entry = watchlist.find((item) => item.symbol === symbol);
  if (!entry) throw new AccountChangeError('Saham ini sudah dihapus dari pantauan.');
  return entry;
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
      if (error instanceof AccountChangeError) throw error;
      setWriteError(dataError(error));
      return false;
    } finally {
      setPending((count) => count - 1);
    }
  }

  async function readAccountFromServer() {
    const snapshot = await getDocFromServer(doc(db, 'users', uid));
    return normalizeAccountData(snapshot.data());
  }

  async function hasJournalTrade(id) {
    return (await readAccountFromServer()).journal.some((trade) => trade.id === id);
  }

  function addWatchlistSymbol(symbol, category) {
    return update((current) => ({ ...current, watchlist: addSymbol(current.watchlist, symbol, category) }));
  }

  function saveWatchlistCategories(symbol, previous, selected) {
    return update((current) => {
      requireWatchlistEntry(current.watchlist, symbol);
      return { ...current, watchlist: setWatchlistCategories(current.watchlist, symbol, previous, selected) };
    });
  }

  function saveWatchlistNotes(symbol, previousNotes, value) {
    const notes = value.trim();
    return update((current) => {
      const { notes: savedNotes = '' } = requireWatchlistEntry(current.watchlist, symbol);
      if (savedNotes !== previousNotes && savedNotes !== notes) {
        throw new AccountChangeError('Catatan telah berubah. Buka kembali catatan untuk melihat versi terbaru.');
      }
      return { ...current, watchlist: setWatchlistNotes(current.watchlist, symbol, notes) };
    });
  }

  async function saveWatchlistImage(symbol, previousImageId, file) {
    const imageId = file ? crypto.randomUUID() : undefined;
    let saved;
    try {
      if (file) await uploadWatchlistImage(uid, imageId, file);
      saved = await update((current) => {
        const entry = requireWatchlistEntry(current.watchlist, symbol);
        if (entry.imageId !== previousImageId && entry.imageId !== imageId) {
          throw new AccountChangeError('Gambar telah berubah. Buka kembali gambar untuk melihat versi terbaru.');
        }
        return { ...current, watchlist: setWatchlistImage(current.watchlist, symbol, imageId) };
      });
    } catch (error) {
      if (imageId) await deleteWatchlistImage(uid, imageId);
      throw error;
    }

    if (!saved && imageId) {
      // Respons transaksi bisa gagal setelah server menyimpan referensi gambar.
      const current = await readAccountFromServer().catch(() => null);
      if (current) {
        saved = current.watchlist.some((entry) => entry.symbol === symbol && entry.imageId === imageId);
        if (!saved) await deleteWatchlistImage(uid, imageId);
      }
    }
    if (saved && previousImageId) await deleteWatchlistImage(uid, previousImageId);
    return saved;
  }

  async function removeWatchlistSymbol(symbol) {
    let imageId;
    const saved = await update((current) => {
      imageId = current.watchlist.find((entry) => entry.symbol === symbol)?.imageId;
      return { ...current, watchlist: removeSymbol(current.watchlist, symbol) };
    });
    if (saved && imageId) await deleteWatchlistImage(uid, imageId);
    return saved;
  }

  return {
    ...data,
    ready,
    pending: pending > 0,
    error: readError || writeError,
    readError,
    retry: () => setAttempt((value) => value + 1),
    update,
    hasJournalTrade,
    addWatchlistSymbol,
    saveWatchlistCategories,
    saveWatchlistNotes,
    saveWatchlistImage,
    removeWatchlistSymbol,
  };
}
