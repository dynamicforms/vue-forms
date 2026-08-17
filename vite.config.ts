/// <reference types="vitest" />
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import eslint from 'vite-plugin-eslint';
import dts from 'vite-plugin-dts';
import { visualizer } from 'rollup-plugin-visualizer';

/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [
    vue(),
    {
      ...eslint({
        failOnWarning: false,
        failOnError: false,
      }),
      apply: 'serve',
      enforce: 'post',
    },
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
      '@': resolve(__dirname, './src'),
      '~': resolve(__dirname, '../../node_modules'),
    },
    extensions: [
      '.js',
      '.mjs',
      '.ts',
    ],
  },
  build: {
    target: 'es2015',
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'dynamicforms-vue-forms',
    },
    rollupOptions: {
      external: [
        'lodash-es',
        'vue',
      ],
      // lodash-es is ESM-only, so the CJS/UMD artifact cannot require() it; 'lodash' is the CJS packaging of
      // the same source. external is an input option and cannot differ per format, so the substitution lives
      // in the UMD output's paths. Both packages are declared in dependencies.
      output: [
        {
          format: 'es',
          entryFileNames: 'dynamicforms-vue-forms.js',
        },
        {
          format: 'umd',
          entryFileNames: 'dynamicforms-vue-forms.umd.cjs',
          name: 'DynamicFormsVueForms',
          exports: 'named',
          paths: { 'lodash-es': 'lodash' },
          globals: { 'lodash-es': '_', vue: 'Vue' },
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
