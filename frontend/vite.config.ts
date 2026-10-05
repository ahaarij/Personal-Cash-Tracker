import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const VENDOR_CHUNKS: Record<string, string[]> = {
  vendor: ['react', 'react-dom'],
  query: ['@tanstack/react-query'],
  router: ['@tanstack/react-router'],
}

export default defineConfig({
  plugins: [
    react(),
    // TanStackRouterVite removed — we use code-based (non-file-based) routing
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Personal Cash Flow',
        short_name: 'Cash Flow',
        description: 'Personal daily cash flow tracker',
        theme_color: '#1C1A18',
        background_color: '#F7F5F2',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // manualChunks must be a function in Vite 8 / rolldown
        manualChunks: (id: string) => {
          for (const [chunk, pkgs] of Object.entries(VENDOR_CHUNKS)) {
            if (pkgs.some((p) => id.includes(`/node_modules/${p}/`))) return chunk
          }
          return undefined
        },
      },
    },
  },
})
