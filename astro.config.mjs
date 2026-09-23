// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';
import { webhookPlugin } from './vite-webhook-plugin.js';

export default defineConfig({
 server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 3000  
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss(), webhookPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Allow both the public IP and the custom domain you used earlier
      allowedHosts: ['103.124.138.223', 'rio.greennet.id']
    }  
},
});
