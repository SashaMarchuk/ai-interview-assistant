import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    // Icons will be added in Task 3
  },
});
