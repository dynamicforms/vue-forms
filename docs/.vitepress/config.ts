import { defineConfig } from 'vitepress';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  title: 'Vue Forms',
  description: 'A lightweight, reactive data entry forms library for Vue.js',
  ignoreDeadLinks: [
    /^https?:\/\/localhost/
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/field-base' },
      { text: 'Examples', link: '/examples/basic-form' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Rationale', link: '/guide/rationale' },
            { text: 'The model', link: '/guide/model' },
            { text: 'Cookbook', link: '/guide/cookbook' },
          ]
        },
        {
          text: 'Upgrading',
          items: [
            { text: 'Changelog', link: '/guide/changelog' },
            { text: 'Migration guide', link: '/guide/migration' },
          ]
        }
      ],
      '/api/': [
        {
          text: 'Concepts',
          items: [
            { text: 'The model', link: '/guide/model' },
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'FieldBase', link: '/api/field-base' },
            { text: 'Field', link: '/api/field' },
            { text: 'Action', link: '/api/action' },
            { text: 'Group', link: '/api/group' },
            { text: 'List', link: '/api/list' },
            { text: 'Container', link: '/api/container' },
            { text: 'view()', link: '/api/view' },
            { text: 'Validators', link: '/api/validators' },
            { text: 'Actions', link: '/api/actions' },
            { text: 'Transactions', link: '/api/transactions' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic Form', link: '/examples/basic-form' },
            { text: 'List', link: '/examples/list' },
            { text: 'Validators', link: '/examples/validators' },
            { text: 'Conditional statements', link: '/examples/conditional-statement' },
            { text: 'Action', link: '/examples/action' },
            { text: 'Transactions', link: '/examples/transactions' },
            { text: 'Extended properties', link: '/examples/extended-properties' },
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/dynamicforms/vue-forms' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Jure Erznožnik'
    }
  },
  vite: {
    plugins: [vuetify()],
    optimizeDeps: {
      include: ['vuetify'],
    },
    ssr: {
      noExternal: ['vuetify'],
    }
  },
});

