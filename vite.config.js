import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '/3D-Racing-Game/',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'docs',
  },
});
