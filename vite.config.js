import { defineConfig } from 'vite';

// For static hosting (e.g., GitHub Pages) the app may live under a sub-path.
// Set VITE_BASE to that sub-path, e.g. "/customer-care-app/"
export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE ?? '/';
  return {
    base,
    root: './public',
    server: {
      port: 5173,
      strictPort: true
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true
    }
  };
});

