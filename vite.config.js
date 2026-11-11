import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const config = {
  plugins: [react()],
  server: {
    // Port khusus agar tidak bentrok dengan proyek lain yang berjalan bersamaan.
    port: 5175,
    strictPort: false,
    // Teruskan panggilan function ke `netlify dev` (jalan di port 9500)
    // supaya frontend bisa dites tanpa melewati proksi Netlify langsung.
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:9500',
        changeOrigin: true,
      },
    },
  },
};

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const firebaseEnv = loadEnv(mode, process.cwd(), 'VITE_FIREBASE_');
    if (Object.values(firebaseEnv).some((value) => value.trim().startsWith('**'))) {
      throw new Error('Konfigurasi Firebase tersamarkan. Buat build dengan konfigurasi Firebase yang valid sebelum deploy.');
    }
  }
  return config;
});
