import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GLSL files are imported as raw strings via Vite's built-in `?raw` suffix,
// so no extra shader plugin is needed.
//
// `base` is `/` in dev (where the site is served at the root) and switches
// to `/effective-rotary-phone/` for production builds so the bundle works
// when hosted at `https://<user>.github.io/effective-rotary-phone/`.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/effective-rotary-phone/' : '/',
  plugins: [react()],
  server: {
    host: true,
  },
}));
