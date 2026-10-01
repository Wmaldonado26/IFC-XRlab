import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
//import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('bim-'),
        }
      }
    }),
    //vueDevTools(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: [
      '@thatopen/components',
      '@thatopen/components-front',
      '@thatopen/fragments',
      '@thatopen/ui',
      '@thatopen/ui-obc',
      'three',
      'web-ifc',
    ],
  },
})
