import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@logic': path.resolve(__dirname, './src/logic'),
      '@core': path.resolve(__dirname, './src/logic/core'),
      '@game': path.resolve(__dirname, './src/logic/core/game'),
      '@interfaces': path.resolve(__dirname, './src/logic/interfaces'),
      '@modules': path.resolve(__dirname, './src/logic/modules'),
      '@buildings': path.resolve(__dirname, './src/logic/modules/buildings'),
      '@upgrades': path.resolve(__dirname, './src/logic/modules/upgrades'),
      '@drones': path.resolve(__dirname, './src/logic/modules/drones'),
      '@resources': path.resolve(__dirname, './src/logic/modules/resources'),
      '@systems': path.resolve(__dirname, './src/logic/systems'),
      '@scene': path.resolve(__dirname, './src/logic/systems/scene'),
      '@map': path.resolve(__dirname, './src/logic/systems/map'),
      '@commands': path.resolve(__dirname, './src/logic/systems/commands'),
      '@modifiers': path.resolve(__dirname, './src/logic/systems/modifiers-system'),
      '@save-load': path.resolve(__dirname, './src/logic/systems/save-load'),
      '@utils': path.resolve(__dirname, './src/logic/utils'),
      '@shared': path.resolve(__dirname, './src/logic/shared'),
      '@ui': path.resolve(__dirname, './src/ui')
    }
  },
  server: {
    // Налаштування для статичних файлів
    fs: {
      strict: false
    }
  },
  // Явно вказуємо що public - це статичні файли
  publicDir: 'public',
  // Налаштування для обробки зображень
  assetsInclude: ['**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.webp'],
  // Налаштування для правильних MIME типів
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || [];
          const ext = info[info.length - 1];
          if (/\.(jpg|jpeg|png|webp)$/i.test(assetInfo.name || '')) {
            return `textures/[name].[ext]`;
          }
          return `assets/[name]-[hash].[ext]`;
        }
      }
    }
  }
})
