import { resolve } from 'path';
import vinext from 'vinext';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
  resolve: {
    alias: {
      // Prisma generates `.prisma/client/default` which Vite can't resolve
      // (starts with `.` so treated as relative path). Alias to the workerd-
      // appropriate wasm.js entry so Vite bundles the Prisma client properly.
      '.prisma/client/default': resolve(import.meta.dirname, 'node_modules/.prisma/client/wasm.js'),
    },
  },
});
