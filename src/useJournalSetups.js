import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from './firestore.js';
import { journalSetupsCollection } from './journalSetups.js';

const setupsRef = db && collection(db, journalSetupsCollection);

export default function useJournalSetups(uid) {
  const [state, setState] = useState({ setups: [], loading: true, failed: false });

  useEffect(() => {
    setState({ setups: [], loading: true, failed: false });
    const owned = query(setupsRef, where('uid', '==', uid));
    return onSnapshot(owned, (snapshot) => {
      const setups = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      setState({ setups, loading: false, failed: false });
    }, () => setState({ setups: [], loading: false, failed: true }));
  }, [uid]);

  function save(setup) {
    return addDoc(setupsRef, { ...setup, uid, createdAt: serverTimestamp() });
  }

  function cancel(id) {
    return deleteDoc(doc(setupsRef, id));
  }

  return { ...state, save, cancel };
}
