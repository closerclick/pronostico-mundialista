import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // DESARROLLO: SW autodestructivo. Limpia cualquier caché previa y se
      // desregistra para que SIEMPRE se sirva contenido fresco desde la red.
      // (Para producción, quitar `selfDestroying` para volver a instalar la PWA.)
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pronóstico Mundialista',
        short_name: 'Mundial',
        description: 'Arma tu pronóstico del Mundial 2026 y compártelo firmado por QR',
        theme_color: '#0a1730',
        background_color: '#060e20',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // Sin precache: el SW solo existe para que la app sea instalable como PWA.
      workbox: {
        globPatterns: [],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
        navigateFallback: null
      }
    })
  ],
  base: './',
})
