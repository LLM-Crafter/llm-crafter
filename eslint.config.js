const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'docs/.vitepress/dist/**',
      'docs/.vitepress/cache/**',
      'coverage/**',
      '*.min.js',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Code style rules
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],

      // Best practices
      // 'no-console': 'warn', // Disabled for Node.js backend
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],

      // ES6+ features
      'arrow-spacing': 'error',
      'no-duplicate-imports': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',

      // Error prevention
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-trailing-spaces': 'error',
      'comma-dangle': ['error', 'never'],
      'no-multiple-empty-lines': ['error', { max: 2 }],
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
