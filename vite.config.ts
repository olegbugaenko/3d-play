import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
