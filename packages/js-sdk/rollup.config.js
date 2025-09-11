import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';

const isProduction = process.env.NODE_ENV === 'production';

const baseConfig = {
  input: 'src/index.js',
  external: ['node-fetch'],
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    json(),
  ],
};

export default [
  // CommonJS build
  {
    ...baseConfig,
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
    },
    plugins: [...baseConfig.plugins, isProduction && terser()].filter(Boolean),
  },

  // ES Module build
  {
    ...baseConfig,
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
    },
    plugins: [...baseConfig.plugins, isProduction && terser()].filter(Boolean),
  },

  // UMD build for browsers
  {
    ...baseConfig,
    external: [], // Include all dependencies in UMD build
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'LLMCrafterSDK',
      exports: 'named',
      globals: {
        'node-fetch': 'fetch',
      },
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      json(),
      isProduction && terser(),
    ].filter(Boolean),
  },
];
