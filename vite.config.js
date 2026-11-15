import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Línea de public/sw.js que se reemplaza por la lista de assets del build.
const SW_PRECACHE_PLACEHOLDER = 'self.__PRECACHE_ASSETS = [];'

/**
 * Escribe en dist/sw.js los JS/CSS (y demás assets con hash) que emitió el
 * build, para que el service worker los precachee al instalarse: así una
 * pestaña o un modal lazy que nunca se abrió funciona sin conexión. Solo en
 * build; en dev el placeholder queda vacío. La lista cambia con cada deploy,
 * así que sw.js también cambia y el navegador detecta la versión nueva.
 */
function swPrecache() {
  let outDir = 'dist'
  let base = '/'
  let assets = []
  return {
    name: 'anitracker-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      base = config.base || '/'
    },
    generateBundle(_options, bundle) {
      assets = Object.keys(bundle)
        .filter((file) => !/\.(html|map)$/.test(file) && file !== 'sw.js')
        .sort()
        .map((file) => `${base}${file}`)
    },
    async closeBundle() {
      const swPath = resolve(outDir, 'sw.js')
      const source = await readFile(swPath, 'utf8')
      if (!source.includes(SW_PRECACHE_PLACEHOLDER)) {
        this.error(`swPrecache: no encontré "${SW_PRECACHE_PLACEHOLDER}" en ${swPath}`)
      }
      await writeFile(swPath, source.replace(SW_PRECACHE_PLACEHOLDER, `self.__PRECACHE_ASSETS = ${JSON.stringify(assets)};`))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swPrecache()],
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
