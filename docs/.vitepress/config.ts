import { defineConfig } from 'vitepress';

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
      { text: 'Examples', link: '/examples/basic-form' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic Form', link: '/examples/basic-form' },
            { text: 'Validators', link: '/examples/validators' },
            { text: 'Conditional statements', link: '/examples/conditional-statement' },
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/velis74/dynamicforms-vue-forms' }
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Jure Erznožnik'
    }
  }
});

