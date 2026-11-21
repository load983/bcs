import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The hosted preview uses a generated *.us4.manus.computer hostname.
    // Keep localhost development working while allowing that preview origin.
    allowedHosts: ['.us4.manus.computer', '.us1.manus.computer'],
  },
  // smiles-drawer (CommonJS) কখনো `global` ধরে নেয় — ব্রাউজারে globalThis দিয়ে মেটানো
  define: { global: 'globalThis' },
});
