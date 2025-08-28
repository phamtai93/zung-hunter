import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ 
      manifest,
      // Add these for beta version
      browser: 'chrome'
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html',
      },
      // Let CRXJS handle content scripts automatically
    },
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  // Important for service worker
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
})