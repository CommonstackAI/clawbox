import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => {
  const pkg = await import('./package.json', { with: { type: 'json' } })
  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.default.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react'
            if (id.includes('/three/')) return 'vendor-three'
            if (id.includes('@radix-ui')) return 'vendor-radix'
            if (id.includes('i18next')) return 'vendor-i18n'
            if (
              id.includes('react-markdown') ||
              id.includes('remark-') ||
              id.includes('rehype-') ||
              id.includes('/unified/') ||
              id.includes('/micromark/') ||
              id.includes('/mdast-') ||
              id.includes('/hast-')
            ) {
              return 'vendor-markdown'
            }
            return 'vendor'
          },
        },
      },
    },
    clearScreen: false,
    server: {
      port: 14200,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: 'ws', host, port: 14201 }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  }
})
