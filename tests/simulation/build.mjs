/**
 * Bundles the application's domain modules so Node can import them.
 *
 * Five things stop `node` loading `src/` directly, and esbuild — already
 * present as a Vite dependency, so no new package — clears all five:
 *
 *   the `@/*` alias            --alias:@=./src
 *   JSX in the graph           --jsx=automatic  (src/lib/auth.tsx)
 *   `import.meta.env`          --define
 *   extensionless specifiers   the bundler resolves them
 *   TypeScript                 esbuild strips it
 *
 * Everything else — `window`, `localStorage` — is shimmed at runtime by
 * env.mjs, because the data modules read the active organisation key at plain
 * module-evaluation time.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

await build({
  entryPoints: [resolve(here, 'app-entry.ts')],
  outfile: resolve(here, '.build/app.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  jsx: 'automatic',
  // Firebase and React resolve from node_modules at run time; bundling them
  // buys nothing and makes the output slow to build.
  packages: 'external',
  alias: { '@': resolve(root, 'src') },
  define: {
    // The production default. The simulation is about tenant-scoped behaviour,
    // and the E2E account grants would only add fixed emails with no orgId.
    'import.meta.env': JSON.stringify({ VITE_ENABLE_E2E_ACCOUNTS: 'false' }),
  },
  logLevel: 'warning',
});
