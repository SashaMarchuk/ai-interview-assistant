import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss() as any, tsconfigPaths()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
  }),
  manifest: {
    name: 'AI Interview Assistant',
    version: '0.1.0',
    description: 'Real-time AI assistance for technical interviews',
    permissions: ['tabCapture', 'activeTab', 'offscreen', 'storage', 'scripting'],
    host_permissions: ['https://meet.google.com/*'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' wss://api.elevenlabs.io https://openrouter.ai",
    },
    minimum_chrome_version: '116',
    icons: {
      16: 'icon/icon-16.png',
      32: 'icon/icon-32.png',
      48: 'icon/icon-48.png',
      128: 'icon/icon-128.png',
    },
  },
});
