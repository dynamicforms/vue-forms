import velis from 'eslint-config-velis';

export default [
  ...velis,
  {
    ignores: [
      'dist/*',
      'coverage/*',
      'node_modules/*',
      'docs/*',
      'vite.config.ts'
    ]
  }
];
