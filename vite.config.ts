import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works from any static path (e.g. GitHub Pages project site).
export default defineConfig({
  base: './',
  plugins: [react()],
});
