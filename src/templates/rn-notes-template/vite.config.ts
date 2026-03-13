import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as esbuild from 'esbuild'
import { readFileSync } from 'fs'

const extensions = [
  '.mjs',
  '.web.tsx',
  '.tsx',
  '.web.ts',
  '.ts',
  '.web.jsx',
  '.jsx',
  '.web.js',
  '.js',
  '.css',
  '.json',
]

const rollupPlugin = (matchers: RegExp[]) => ({
  name: 'js-in-jsx',
  load(id: string) {
    if (matchers.some((matcher) => matcher.test(id)) && id.endsWith('.js')) {
      const file = readFileSync(id, { encoding: 'utf-8' })
      return esbuild.transformSync(file, { loader: 'jsx', jsx: 'automatic' })
    }
  },
})

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
    extensions,
  },
  define: {
    __DEV__: true,
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  build: {
    rollupOptions: {
      plugins: [rollupPlugin([/react-native-vector-icons/])],
    },
  },
  optimizeDeps: {
    exclude: ['react-native'],
    include: ['react-native-web'],
    esbuildOptions: {
      resolveExtensions: extensions,
      jsx: 'automatic',
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 5174,
    strictPort: true,
  },
})
