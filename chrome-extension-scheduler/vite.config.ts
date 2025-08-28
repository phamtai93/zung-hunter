import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ 
      manifest,
      browser: 'chrome',
      // Fix content script chunking and loader issues
      contentScripts: {
        injectCss: false,
        // Disable preamble to prevent loader creation
        preambleCode: false
      }
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: false, // Keep unminified for debugging
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html'
      },
      output: {
        // Control file naming to prevent chunking issues
        entryFileNames: (chunkInfo) => {
          // Keep content script as single file with predictable name
          if (chunkInfo.name?.includes('request-tracker') || 
              chunkInfo.facadeModuleId?.includes('content/request-tracker')) {
            return 'src/content/request-tracker.js';
          }
          
          // Background script
          if (chunkInfo.name?.includes('background') || 
              chunkInfo.facadeModuleId?.includes('background/background')) {
            return 'src/background/background.js';
          }
          
          // Other entries
          return 'src/[name]/[name].js';
        },
        
        // Control chunk creation
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
        
        // Prevent automatic chunking for content scripts
        manualChunks: undefined
      },
      
      // Prevent code splitting that creates loader issues
      external: []
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    global: 'globalThis'
  },
  server: {
    hmr: false // Disable HMR for extensions
  },
  esbuild: {
    target: 'es2020'
  },
  
  // Optimize deps to prevent chunking issues
  optimizeDeps: {
    // Don't pre-bundle extension-specific modules
    exclude: ['chrome']
  }
})