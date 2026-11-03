import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid({ ssr: true })],
  publicDir: 'public',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    ssrEmitAssets: true,
    assetsInlineLimit: 0,
    rollupOptions: { input: 'src/client.tsx' },
  },
});
