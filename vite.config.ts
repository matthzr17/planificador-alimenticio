import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages publica en https://<usuario>.github.io/planificador-alimenticio/
const BASE = '/planificador-alimenticio/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Planificador Alimenticio',
        short_name: 'Nutri',
        description: 'Perfil nutricional, despensa, menú semanal y lista de compras.',
        lang: 'es-MX',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f4',
        theme_color: '#2f6b4f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // La SPA usa HashRouter, así que basta con cachear el shell.
        // Las llamadas a Supabase son de otro dominio y no se cachean: datos siempre frescos.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Manejo de notificaciones (avisos de caducidad)
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  build: {
    // React + Supabase pesan ~160 kB comprimidos; los módulos ya se cargan por partes
    chunkSizeWarningLimit: 600,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
