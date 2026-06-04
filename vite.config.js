import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      external: (id) => id.startsWith('@capacitor/'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/deezer': {
        target: 'https://api.deezer.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/deezer/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => console.log('Deezer proxy error:', err));
        },
      }
    }
  }
})
