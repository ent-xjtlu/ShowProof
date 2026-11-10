import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: false,
    proxy: { '/api': 'http://localhost:8787' },
    watch: {
      // 编辑器/工具链会在源码目录旁生成临时目录，Windows 上监听它们会 EBUSY 直接崩掉。
      ignored: [
        '**/.*.tmpdir/**',
        '**/*.tmp',
        '**/dist/**',
        '**/preview/**',
        '**/*.{png,jpg,jpeg,webp,gif,ico}',
      ],
    },
  },
})
