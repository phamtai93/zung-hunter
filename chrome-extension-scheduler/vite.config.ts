import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'

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
          if (!existsSync('dist/content-scripts')) {
            mkdirSync('dist/content-scripts', { recursive: true })
          }
        },
        writeBundle() {
          try {
            // Copy and process manifest.json
            if (existsSync('manifest.json')) {
              const manifestContent = readFileSync('manifest.json', 'utf8')
              const manifest = JSON.parse(manifestContent)
              
              writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2))
              console.log('✅ Manifest copied and processed')
            } else {
              console.error('❌ manifest.json not found in root directory')
            }
            
            if (!existsSync('dist/icons')) {
              mkdirSync('dist/icons', { recursive: true })
            }

            // Copy icons
            const iconSizes = ['16', '48', '128']
            iconSizes.forEach(size => {
              const iconPath = `src/assets/icons/icon${size}.png`
              if (existsSync(iconPath)) {
                copyFileSync(iconPath, `dist/icons/icon${size}.png`)
                console.log(`✅ Icon ${size} copied`)
              } else {
                console.warn(`⚠️ Icon ${size} not found at ${iconPath}`)
              }
            })

            if (!existsSync('dist/src/content')) {
              mkdirSync('dist/src/content', { recursive: true })
            }
            
            // Copy main world interceptor as web accessible resource
            const mainWorldSource = 'src/content/main-world-interceptor.ts'
            if (existsSync(mainWorldSource)) {
              copyFileSync(mainWorldSource, 'dist/src/content/main-world-interceptor.ts')
              console.log('✅ Main world interceptor copied as web accessible resource')
            }
            
            console.log('✅ All extension files processed successfully')
          } catch (error) {
            console.error('❌ Error copying extension files:', error)
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
          // Background service worker
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
            
            // Content scripts - maintain folder structure
            if (name.includes('content-scripts/')) {
              return `${name}.js`
            }
            
            // Other entries
            return `${name}.js`
          },
          chunkFileNames: 'chunks/[name]-[hash].js',
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
            return 'assets/[name]-[hash].[ext]'
          }
        },
        external: ['chrome']
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
      drop: isDev ? [] : []  // Keep console logs for debugging in extensions
    },
    
    optimizeDeps: {
      exclude: ['chrome']
    }
  }
})