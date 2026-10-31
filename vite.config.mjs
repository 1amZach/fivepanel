import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// `npm run dev` serves the UI here and sends the rest to a running panel.
const panel = process.env.PANEL ?? 'http://localhost:40120';

export default defineConfig({
    root: 'web',
    plugins: [svelte()],
    build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 300 },
    server: {
        proxy: {
            '/api': panel,
            '/auth': panel,
            '/map-image': panel,
            '/ws': { target: panel.replace(/^http/, 'ws'), ws: true },
        },
    },
});
