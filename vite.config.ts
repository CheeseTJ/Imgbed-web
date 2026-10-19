import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 业务接口走代理，开发期完全不涉及 CORS。
    // 生产环境由 VITE_API_BASE 指向 https://imgbed.june-t.top（跨域，靠后端白名单放行）。
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:18080',
        changeOrigin: true,
      },
    },
  },
})
