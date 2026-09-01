/// <reference types="vitest" />
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
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
    // The target is the syntax a consumer's toolchain has to parse, not the runtime the package ends up on - a
    // consuming bundler re-transpiles the chunk to its own target. es2022 is the floor `engines.node >= 22` and
    // ESM-only already admit; field-base.ts's private class fields are the one construct a lower target would
    // change, lowering them to a WeakMap behind an access check and costing real bytes for compatibility with a
    // consumer these declarations already exclude.
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      fileName: 'dynamicforms-vue-forms',
    },
    rollupOptions: {
      external: [
        '@dynamicforms/translatable',
        'lodash-es',
        'vue',
      ],
      // No plugin strips the published file's whitespace: Vite's format:'es' library build always keeps it
      // (resolveEsbuildTranspileOptions forces minifyWhitespace: false regardless of esbuild options), and a
      // consumer's own bundler minifies the chunk it produces anyway, so what this file weighs on disk is not
      // what an application ships.
      output: [
        {
          format: 'es',
          entryFileNames: 'dynamicforms-vue-forms.js',
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
