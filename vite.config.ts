import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative base so the build works unchanged whether it's served from a
  // domain root, a GitHub Pages project path, or opened straight off disk.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-16.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'NiveshPulse — Intraday decision support',
        short_name: 'NiveshPulse',
        description:
          'Paper-trading decision-support prototype for Indian cash equities. Synthetic data only — not live market data or investment advice.',
        theme_color: '#f4f7f2',
        background_color: '#f4f7f2',
        display: 'standalone',
        start_url: './',
        scope: './',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything here is static, synthetic demo data — safe to cache
        // aggressively so the installed app opens instantly, including
        // offline. There is no live feed to go stale in the cache.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
      },
    }),
  ],
})
