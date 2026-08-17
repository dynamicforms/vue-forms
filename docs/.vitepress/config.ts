import { defineConfig } from 'vitepress';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  title: 'DynamicForms Vue Forms',
  description: 'A lightweight, reactive data entry forms library for Vue.js',
  ignoreDeadLinks: [
    /^https?:\/\/localhost/
  ],
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/field' },
      { text: 'Examples', link: '/examples/basic-form' },
      { text: 'Changelog', link: 'https://github.com/dynamicforms/vue-forms/blob/main/changelog.md' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'The model', link: '/guide/model' },
          ]
        },
        {
          text: 'Upgrading',
          items: [
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
            { text: 'Field', link: '/api/field' },
            { text: 'Group', link: '/api/group' },
            { text: 'List', link: '/api/list' },
            { text: 'Validators', link: '/api/validators' },
            { text: 'Actions', link: '/api/actions' },
            { text: 'Transactions', link: '/api/transactions' },
            { text: 'Components', link: '/api/components' },
            { text: 'Configuration', link: '/api/config' },
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
            { text: 'Messages widget', link: '/examples/messages-widget' },
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

