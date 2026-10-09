/// <reference types="vitest" />
import { renameSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
      // a plugin entry imports the package by its name, so its declarations refer to the package's, not a copy
      aliasesExclude: ['@dynamicforms/vue-forms'],
      // the rolled-up declarations are named after the base name of each entry; they are moved next to the
      // entry's JavaScript, over the unrolled file tsc emitted there
      afterBuild() {
        const dist = resolve(import.meta.dirname, 'dist');
        renameSync(resolve(dist, 'dynamicforms-vue-forms.d.ts'), resolve(dist, 'index.d.ts'));
        renameSync(resolve(dist, 'tracking.d.ts'), resolve(dist, 'plugins/tracking.d.ts'));
      },
    }),
    visualizer({
      open: false,
      filename: 'coverage/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      // a plugin entry imports the package by its name; the build keeps it external, so the entry uses the same
      // module instance as the application
      '@dynamicforms/vue-forms': resolve(import.meta.dirname, './src/index.ts'),
      '@': resolve(import.meta.dirname, './src'),
      '~': resolve(import.meta.dirname, '../../node_modules'),
    },
    extensions: [
      '.js',
      '.mjs',
      '.ts',
    ],
  },
  build: {
    // The target is the syntax a consumer's toolchain must parse, not the runtime: a consuming bundler transpiles
    // the chunk to its own target. es2022 is the minimum that `engines.node >= 22` and ESM-only already require.
    // field-base.ts's private class fields are the only construct a lower target would change: it would lower them
    // to a WeakMap with an access check, adding bytes for consumers these settings already exclude.
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: {
        'dynamicforms-vue-forms': resolve(import.meta.dirname, 'src/index.ts'),
        'plugins/tracking': resolve(import.meta.dirname, 'src/plugins/tracking.ts'),
      },
    },
    rollupOptions: {
      external: [
        '@dynamicforms/vue-forms',
        'lodash-es',
        'vue',
      ],
      // The published file keeps its whitespace: Vite's format:'es' library build always keeps it
      // (resolveEsbuildTranspileOptions forces minifyWhitespace: false regardless of esbuild options), and a
      // consumer's bundler minifies its own output, so the file size on disk is not the size an application ships.
      output: [
        {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
        },
      ],
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*'
      ],
      exclude: [
        '**/index.ts',
      ],
    },
    server: {
      deps: {
        // inline: ['vuetify']
      },
    },
    globals: true,
    environment: 'jsdom',
  },
});
