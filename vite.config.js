import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        // Se quitan solo los logs de depuración: console.error/warn quedan en
        // producción para poder diagnosticar fallos de sync o de las APIs.
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
    },
    rolldownOptions: {
      output: {
        // React y Firebase en chunks propios: cambian poco entre deploys, así
        // el navegador los reusa de cache. Firebase sigue cargándose lazy.
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'firebase', test: /[\\/]node_modules[\\/](firebase|@firebase|idb)[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: true,
    pool: 'vmThreads',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
      // Baseline medido al agregar el chequeo (85/80/72/70). Un punto de margen
      // para que un refactor legítimo no rompa CI por ruido, pero una regresión
      // real (módulo nuevo sin tests) sí lo hace.
      thresholds: {
        lines: 84,
        statements: 79,
        functions: 70,
        branches: 69,
      },
    },
  },
})
