/*
 * Bundles a harness entry point and runs it in a node process started with --expose-gc, which the heap
 * measurement needs. The bundle inlines vue and lodash-es, so the output can live outside the project tree.
 *
 * Imports of `vue` from the library source are redirected to vue-proxy-counter.mjs, which counts the calls to
 * `reactive()`; the counter module reaches the real package through the `vue-actual` specifier. Redirection
 * happens in the bundler, so the library source stays untouched.
 *
 *   node bench/build-harness.mjs [entry]
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const require = createRequire(import.meta.url);

const entry = path.resolve(projectRoot, process.argv[2] ?? 'bench/memory-harness.mjs');
const outfile = path.join(projectRoot, 'node_modules/.cache/vue-forms-bench', `${path.parse(entry).name}.mjs`);

const counterPath = path.join(here, 'vue-proxy-counter.mjs');

const countReactiveCalls = {
  name: 'count-reactive-calls',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^vue$/ }, () => ({ path: counterPath }));
    pluginBuild.onResolve({ filter: /^vue-actual$/ }, () => ({ path: require.resolve('vue') }));
  },
};

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  sourcemap: 'inline',
  logLevel: 'warning',
  resolveExtensions: ['.mjs', '.ts', '.js', '.json'],
  alias: { '@': path.join(projectRoot, 'src') },
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  plugins: [countReactiveCalls],
});

const nodeArgs = ['--expose-gc', outfile];
process.stdout.write(`$ node ${nodeArgs.join(' ')}\n\n`);
const run = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });
process.exit(run.status ?? 1);
