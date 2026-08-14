# DynamicForms Vue Forms Documentation

This directory contains the VitePress documentation for `@dynamicforms/vue-forms`.

The documentation is publicly hosted at **https://docs.velis.si/dynamicforms/vue-forms**.

## Development

To start the documentation site in development mode:

```bash
npm run docs:dev
```

It works from the repo root (`docs` is an npm workspace, so the root script just forwards to it) as well as from the
`docs/` directory. The site will be available at http://localhost:5173/

`npm run docs:preview` serves the production build locally.

## Structure

- `.vitepress/` - VitePress configuration
  - `config.ts` - site config (nav, sidebar)
  - `theme/` - custom theme: registers Vuetify, VueMarkdown and the `forms` plugin
- `guide/` - User guide documentation
- `api/` - API reference documentation
- `examples/` - Interactive examples
- `components/` - Vue components used in the documentation

## Building

To build the documentation site for production:

```bash
# From the root directory
npm run docs:build
```

The built site will be in the `docs/.vitepress/dist` directory.

## Adding New Examples

1. Create a new Vue component in `components/` (e.g. `docs/components/my-demo.vue`)
2. Create a new markdown page in `examples/`
3. Import and use the component in your markdown page
4. Register the page in the `/examples/` sidebar in `.vitepress/config.ts`, otherwise it is unreachable from the
   navigation

Demo components can use Vuetify and the globally registered `VueMarkdown` component — both are installed in
`.vitepress/theme/index.ts`, which also configures the `forms` plugin with `useMarkdownInValidators: false`.
