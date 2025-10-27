import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'worker.js', // 假设worker.js是入口文件
  output: {
    file: 'dist/worker.js',
    format: 'esm'
  },
  plugins: [
    nodeResolve(),
    terser()
  ],
  external: [] // 如果有外部依赖，可以在这里添加
};