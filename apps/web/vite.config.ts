import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Debe ir antes que el plugin de React: genera el árbol de rutas desde src/routes.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // Mismo origen que la API en desarrollo: la cookie del refresh token funciona sin CORS.
    proxy: {
      // ws: el canal de notificaciones (Socket.IO en /api/socket.io) pasa por el mismo origen.
      '/api': { target: 'http://localhost:3000', ws: true },
    },
  },
})
