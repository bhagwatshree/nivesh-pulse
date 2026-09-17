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
        // The app shell (HTML/JS/CSS/fonts/icons) is precached so the
        // installed app opens instantly, including offline. Live
        // Upstox/Groww/screener data is fetched at runtime straight from
        // server/upstox-proxy — that traffic never goes through this cache,
        // so precaching the shell doesn't risk serving stale prices.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        // Belt-and-suspenders for the above: explicitly forbid caching the
        // proxy's own responses (quotes, candles, /screener/latest, the
        // OAuth token routes), rather than relying only on it not being
        // named in globPatterns. Prices/signals must always hit the
        // network — a cached price or a cached BUY/EXIT signal is a
        // correctness bug in a trading app, not an acceptable staleness
        // trade-off the way a cached icon or font is.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/nivesh-pulse-upstox-proxy\.bhagwatshree\.workers\.dev\/.*/,
            handler: 'NetworkOnly',
          },
        ],
        // Without these, an already-installed PWA can keep running its old
        // service worker (and therefore the old app shell) until every open
        // window/tab of it is fully closed, not just reloaded — a new
        // deploy can silently not show up. This forces a new service worker
        // to take over immediately on the next load instead of waiting.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
