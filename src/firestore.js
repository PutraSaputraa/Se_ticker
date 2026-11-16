import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { app, useEmulators } from './firebase.js';

export const db = app && getFirestore(app);
if (db && useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
