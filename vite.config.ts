import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'fonts/*.woff2'],
      manifest: {
        name: 'мій календар',
        short_name: 'календар',
        description: 'Тиждень, який планується сам.',
        lang: 'uk',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F5F7',
        theme_color: '#F5F5F7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
