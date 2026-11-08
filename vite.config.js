import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
});
