import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/chat-widget.js',
      format: 'iife',
      name: 'LLMCrafterWidget',
      sourcemap: true,
    },
    {
      file: 'dist/chat-widget.umd.js',
      format: 'umd',
      name: 'LLMCrafterWidget',
      sourcemap: true,
    },
    {
      file: 'dist/chat-widget.min.js',
      format: 'iife',
      name: 'LLMCrafterWidget',
      sourcemap: true,
      plugins: [terser()],
    },
  ],
  plugins: [
    resolve(),
    postcss({
      inject: true,
      minimize: true,
    }),
  ],
};
