import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  
  return {
    plugins: [
      react(),
      // Custom plugin to copy manifest and assets
      {
        name: 'copy-extension-files',
        buildStart() {
          // Ensure directories exist
          if (!existsSync('dist/content-scripts')) mkdirSync('dist/content-scripts', { recursive: true })
        },
        writeBundle() {
          try {
            // Copy manifest.json
            copyFileSync('manifest.json', 'dist/manifest.json')
            if (!existsSync('dist/icons')) mkdirSync('dist/icons', { recursive: true })
            if (!existsSync('dist')) mkdirSync('dist', { recursive: true })
            // Copy icons
            const iconSizes = ['16', '48', '128']
            iconSizes.forEach(size => {
              console.log("copy icon" + size);
              const iconPath = `src/assets/icons/icon${size}.png`
              if (existsSync(iconPath)) {
                copyFileSync(iconPath, `dist/icons/icon${size}.png`)
              }
            })
            
            console.log('✅ Extension files copied successfully')
          } catch (error) {
            console.warn('⚠️ Warning: Could not copy extension files:', error.message)
          }
        }
      }
    ],
    
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2020',
      minify: isDev ? false : 'esbuild',
      sourcemap: isDev,
      watch: isDev ? {} : null,
      rollupOptions: {
        input: {
          // Background script
          background: 'src/background/background.ts',
          
          // Content scripts
          'content-scripts/request-tracker': 'src/content/request-tracker.ts',
          'content-scripts/main-world-interceptor': 'src/content/main-world-interceptor.ts',
          
          // UI pages
          popup: 'src/popup/popup.html',
          options: 'src/options/options.html'
        },
        output: {
          entryFileNames: (chunkInfo) => {
            const name = chunkInfo.name
            
            // Background script
            if (name === 'background') {
              return 'background.js'
            }
            
            // Content scripts - keep the folder structure
            if (name.includes('content-scripts/')) {
              return `${name}.js`
            }
            
            // Other entries
            return `${name}.js`
          },
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name
            
            // HTML files go to root
            if (name?.endsWith('.html')) {
              return name
            }
            
            // CSS files
            if (name?.endsWith('.css')) {
              return 'assets/[name].[ext]'
            }
            
            // Other assets
            return 'assets/[name].[ext]'
          }
        }
      }
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      __DEV__: isDev,
      global: 'globalThis'
    },
    
    esbuild: {
      target: 'es2020',
      drop: isDev ? [] : ['console', 'debugger']
    },
    
    optimizeDeps: {
      exclude: ['chrome']
    }
  }
})