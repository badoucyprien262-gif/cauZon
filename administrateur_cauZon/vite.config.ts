import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/expo-push': {
        target: 'https://exp.host',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/expo-push/, '/--/api/v2/push/send'),
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        }
      }
    }
  },
})
