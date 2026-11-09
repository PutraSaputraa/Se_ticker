import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

export const useEmulators = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_USE_EMULATORS === 'true';
const config = useEmulators ? {
  apiKey: 'demo-api-key',
  authDomain: 'demo-seticker.firebaseapp.com',
  projectId: 'demo-seticker',
  appId: 'demo-seticker-web',
} : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};

export let auth = null;
export let app = null;
export let firebaseSetupError = '';

const configured = Object.values(config).every((value) => value && !/^(API_KEY_ANDA|APP_ID|SENDER_ID)$/.test(value));

if (configured) {
  try {
    app = initializeApp(config);
    auth = getAuth(app);
    if (useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    }
  } catch {
    auth = null;
    app = null;
    firebaseSetupError = 'Layanan login belum siap. Hubungi pengelola aplikasi.';
  }
} else {
  firebaseSetupError = 'Layanan login belum dikonfigurasi. Hubungi pengelola aplikasi.';
}
