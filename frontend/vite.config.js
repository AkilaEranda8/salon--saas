import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:5001';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
          'charts':        ['recharts'],
          'ui':            ['axios', 'socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 3006,
    strictPort: true,
    proxy: {
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: devProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
