import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'mui', test: /node_modules[\\/](@mui|@emotion|@popperjs)[\\/]/ },
            { name: 'charts', test: /node_modules[\\/](chart\.js|react-chartjs-2|@kurkle)[\\/]/ },
            { name: 'realtime', test: /node_modules[\\/](socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser|@socket\.io|axios)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
