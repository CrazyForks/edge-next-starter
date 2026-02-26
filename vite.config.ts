import { resolve, dirname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { createRequire } from 'node:module';
import vinext from 'vinext';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, type Plugin } from 'vite';

/**
 * Vite plugin to resolve `.prisma/client/*` bare module specifiers.
 *
 * Prisma generates `.prisma/client/default` which is a bare specifier
 * (starts with '.' but NOT './'), so Node.js resolves it from node_modules.
 * Vite incorrectly treats it as a relative path. This plugin intercepts
 * the import and resolves it from the actual node_modules location.
 *
 * For Cloudflare Workers, we prefer `wasm.js` (WASM engine) over
 * `default.js` (which uses Node.js-only `#main-entry-point` imports map).
 */
function prismaClientResolve(): Plugin {
  const _require = createRequire(import.meta.url);
  let prismaDir: string | null = null;

  // Strategy 1: Direct path from project root
  const directPath = resolve(process.cwd(), 'node_modules', '.prisma', 'client');

  // Strategy 2: Navigate from @prisma/client (handles pnpm store layout)
  let pnpmPath: string | null = null;
  try {
    const prismaClientPkg = _require.resolve('@prisma/client/package.json');
    const prismaClientDir = dirname(prismaClientPkg);
    pnpmPath = resolve(prismaClientDir, '..', '..', '.prisma', 'client');
  } catch {
    // @prisma/client not found — will fall back to directPath
  }

  // Pick the first existing candidate
  for (const candidate of [directPath, pnpmPath].filter(Boolean) as string[]) {
    if (existsSync(candidate)) {
      prismaDir = candidate;
      break;
    }
  }

  // Diagnostic logging (visible in CI build logs)
  if (prismaDir) {
    try {
      const jsFiles = readdirSync(prismaDir).filter(f => f.endsWith('.js'));
      console.log(`[prisma-resolve] Found .prisma/client at: ${prismaDir}`);
      console.log(`[prisma-resolve] Available JS files: ${jsFiles.join(', ')}`);
    } catch {
      // Ignore read errors
    }
  } else {
    console.warn(
      '[prisma-resolve] WARNING: .prisma/client directory not found.',
      'Run "prisma generate" before building.',
      `Tried: ${[directPath, pnpmPath].filter(Boolean).join(', ')}`
    );
  }

  return {
    name: 'prisma-client-resolve',
    enforce: 'pre',
    resolveId(source) {
      // Only handle .prisma/client/* bare specifiers
      if (!source.startsWith('.prisma/client')) return null;
      if (!prismaDir) return null;

      // Extract the subpath after .prisma/client/
      const subpath = source === '.prisma/client' ? '' : source.slice('.prisma/client/'.length);

      if (subpath === 'default' || subpath === '') {
        // For the main entry, prefer wasm.js (Cloudflare Workers WASM engine)
        const wasmPath = resolve(prismaDir, 'wasm.js');
        if (existsSync(wasmPath)) return wasmPath;

        // Fallback: default.js (relies on #main-entry-point imports map)
        const defaultPath = resolve(prismaDir, 'default.js');
        if (existsSync(defaultPath)) return defaultPath;

        console.error(`[prisma-resolve] Neither wasm.js nor default.js found in ${prismaDir}`);
        return null;
      }

      // For other subpaths (e.g. .prisma/client/index-browser)
      const withExt = resolve(prismaDir, subpath + '.js');
      if (existsSync(withExt)) return withExt;

      const withoutExt = resolve(prismaDir, subpath);
      if (existsSync(withoutExt)) return withoutExt;

      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    prismaClientResolve(),
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
});
