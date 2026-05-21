import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GLSL files are imported as raw strings via Vite's built-in `?raw` suffix,
// so no extra shader plugin is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
  },
});
