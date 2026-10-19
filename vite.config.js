import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the site lives at https://<user>.github.io/<repo>/,
// so the deploy workflow sets VITE_BASE to "/<repo>/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
});
