# ===== COMPLETE PROJECT SETUP GUIDE =====

# Step 1: create project structure
mkdir chrome-extension-scheduler
cd chrome-extension-scheduler

# Create all needed folders
mkdir -p src/{components/{Dashboard,Settings,Report,Layout},background,storage,utils,types,popup,options,assets/icons}
mkdir -p scripts
mkdir -p public

# Step 2: Create all config files (Root level)
# ===== package.json =====
cat > package.json << 'EOF'
{
  "name": "chrome-extension-scheduler",
  "version": "1.0.0",
  "description": "A Chrome extension for scheduling and monitoring web link processing",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint src --ext ts,tsx --fix",
    "clean": "rimraf dist",
    "package": "npm run build && cd dist && zip -r ../extension.zip ."
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "antd": "^5.12.0",
    "dexie": "^3.2.4",
    "dexie-react-hooks": "^1.1.7",
    "cron-parser": "^4.9.0",
    "dayjs": "^1.11.10",
    "@ant-design/icons": "^5.2.6"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@types/chrome": "^0.0.251",
    "@types/node": "^20.9.0",
    "@vitejs/plugin-react": "^4.1.1",
    "@crxjs/vite-plugin": "^2.0.0-beta.21",
    "typescript": "^5.2.2",
    "vite": "^5.0.0",
    "tailwindcss": "^3.3.6",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "eslint": "^8.53.0",
    "@typescript-eslint/eslint-plugin": "^6.11.0",
    "@typescript-eslint/parser": "^6.11.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.4",
    "rimraf": "^5.0.5"
  },
  "engines": {
    "node": ">=16.0.0",
    "npm": ">=7.0.0"
  }
}
EOF

# ===== vite.config.ts =====
cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ 
      manifest,
      contentScripts: {
        injectCss: true,
      }
    })
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html'
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  },
  css: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
EOF

# ===== postcss.config.js =====
cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# ===== tailwind.config.js =====
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Disable Tailwind's reset to avoid conflicts with Ant Design
  }
}
EOF

# ===== tsconfig.json =====
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["chrome"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

# ===== tsconfig.node.json =====
cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

# ===== .eslintrc.json =====
cat > .eslintrc.json << 'EOF'
{
  "env": {
    "browser": true,
    "es2020": true,
    "webextensions": true
  },
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "plugins": [
    "react-refresh",
    "@typescript-eslint"
  ],
  "rules": {
    "react-refresh/only-export-components": [
      "warn",
      { "allowConstantExport": true }
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_" }
    ],
    "react/prop-types": "off"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
EOF

# Step 3: create manifest.json
cat > src/manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "Link Scheduler Extension",
  "version": "1.0.0",
  "description": "Schedule and monitor web link processing with multiple schedule types",
  "permissions": [
    "storage",
    "alarms",
    "activeTab",
    "background"
  ],
  "host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "background": {
    "service_worker": "src/background/background.ts",
    "type": "module"
  },
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "Link Scheduler",
    "default_icon": {
      "16": "src/assets/icons/icon16.png",
      "48": "src/assets/icons/icon48.png",
      "128": "src/assets/icons/icon128.png"
    }
  },
  "options_page": "src/options/options.html",
  "icons": {
    "16": "src/assets/icons/icon16.png",
    "48": "src/assets/icons/icon48.png",
    "128": "src/assets/icons/icon128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["src/assets/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
EOF

# Step 4: Create styles
cat > src/styles/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}

/* Ant Design customizations */
.ant-layout {
  background: #f0f2f5;
}

.ant-layout-sider {
  background: #001529 !important;
}

.ant-menu-dark {
  background: #001529;
}

.ant-card {
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.ant-table-small .ant-table-tbody > tr > td {
  padding: 8px;
}

/* Custom animations */
.processing-indicator {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
EOF

# Step 5: Create README.md
cat > README.md << 'EOF'
# Chrome Extension Link Scheduler

A powerful Chrome extension for scheduling and monitoring web link processing.

## Quick Start

1. Install dependencies: `npm install`
2. Build extension: `npm run build`
3. Load in Chrome: Load unpacked from `dist` folder

## Development

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run lint` - Code linting

## Features

- Multiple schedule types (cron, interval, one-time)
- Real-time dashboard
- Execution history and reports
- Background processing

See artifacts above for complete source code files.
EOF

# Step 6: Install dependencies
echo "Installing dependencies..."
npm install

echo ""
echo "🎉 Project setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Copy all the React component files from the artifacts above into their respective folders"
echo "2. Add actual icon files (16x16, 48x48, 128x128 PNG) to src/assets/icons/"
echo "3. Run 'npm run build' to build the extension"
echo "4. Load the 'dist' folder as unpacked extension in Chrome"
echo ""
echo "📁 Project structure created:"
find . -type d -name node_modules -prune -o -type d -print | head -20

# ===== FILE MAPPING GUIDE =====
echo ""
echo "📝 FILE MAPPING GUIDE - Copy these files from artifacts:"
echo ""
echo "From 'Database Models & Storage Layer':"
echo "  → src/types/index.ts"
echo "  → src/storage/database.ts" 
echo "  → src/storage/repositories.ts"
echo "  → src/utils/constants.ts (partial)"
echo ""
echo "From 'Scheduling Engine & Background Service Worker':"
echo "  → src/utils/scheduler-engine.ts"
echo "  → src/background/scheduler.ts"
echo "  → src/background/alarm-handler.ts"
echo "  → src/background/background.ts"
echo ""
echo "From 'React Components - Layout & Dashboard':"
echo "  → src/components/Layout/Layout.tsx"
echo "  → src/components/Dashboard/RealTimeClock.tsx"
echo "  → src/components/Dashboard/ProcessingStatus.tsx"
echo "  → src/components/Dashboard/UpcomingSchedules.tsx"
echo "  → src/components/Dashboard/LiveLogs.tsx"
echo "  → src/components/Dashboard/Dashboard.tsx"
echo ""
echo "From 'React Components - Settings':"
echo "  → src/components/Settings/LinkForm.tsx"
echo "  → src/components/Settings/ScheduleForm.tsx"
echo "  → src/components/Settings/ScheduleManager.tsx"
echo ""
echo "From 'React Components - Settings Complete & Report':"
echo "  → src/components/Settings/LinkTable.tsx"
echo "  → src/components/Settings/Settings.tsx"
echo "  → src/components/Report/ExecutionHistory.tsx"
echo "  → src/components/Report/ExecutionDetails.tsx"
echo ""
echo "From 'Final React Components & Entry Points':"
echo "  → src/components/Report/ReportFilters.tsx"
echo "  → src/components/Report/Report.tsx"
echo "  → src/options/options.tsx"
echo "  → src/options/options.html"
echo "  → src/popup/popup.tsx"
echo "  → src/popup/popup.html"
echo ""
echo "From 'Separate Source Files':"
echo "  → src/utils/cron-parser.ts"
echo "  → src/utils/logger.ts"
echo "  → (src/styles/globals.css already created)"
echo ""
echo "✅ All config files already created by this script!"
echo "🔧 Just copy the React components and you're ready to build!"

# Optional: Create placeholder icon files
echo ""
echo "Creating placeholder icon files..."
# Create simple colored squares as placeholders
echo "⚠️  Remember to replace these with actual PNG icon files:"
touch src/assets/icons/icon16.png
touch src/assets/icons/icon48.png  
touch src/assets/icons/icon128.png
echo "  → src/assets/icons/icon16.png (16x16 pixels)"
echo "  → src/assets/icons/icon48.png (48x48 pixels)"
echo "  → src/assets/icons/icon128.png (128x128 pixels)"
