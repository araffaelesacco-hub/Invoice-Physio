import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app runs from any folder or static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The PDF chunk (pdf-lib + fontkit) is large but loads only when a PDF is made.
  build: { chunkSizeWarningLimit: 1200 },
});
