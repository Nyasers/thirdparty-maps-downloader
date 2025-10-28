import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import rollupTerser from '@rollup/plugin-terser';
import * as csso from 'csso';
import { minify } from 'terser';
import { minify as minifyHtml } from 'html-minifier-terser';

// 确保缓存目录存在
const cacheDir = '.rollup-cache';
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// 缓存已处理的HTML内容，避免重复处理
const processedHtmlCache = new Map();
// 缓存已处理的JS内容，避免重复处理
const processedJsCache = new Map();
// 缓存已处理的CSS内容，避免重复处理
const processedCssCache = new Map();

// 资源映射，用于将处理后的CSS和JS内容内嵌到worker中并通过/assets路径提供
const assetMap = new Map();

// 创建符合新格式的资源映射项
function createAssetEntry(assetContent, contentType) {
  return { content: assetContent, type: contentType };
}

// 处理CSS文件，简化版本，移除tailwind cli依赖
function processCssFile(cssPath) {
  try {
    // 检查缓存
    if (processedCssCache.has(cssPath)) {
      return processedCssCache.get(cssPath);
    }

    console.log(`处理CSS文件: ${cssPath}`);

    // 读取原始CSS内容
    const originalContent = fs.readFileSync(cssPath, 'utf-8');
    const importRegex = /@import\s+["']([^"']+)['"]\s*;/g;
    const cssDir = path.dirname(cssPath);

    // 处理导入语句
    let match;
    while ((match = importRegex.exec(originalContent)) !== null) {
      const importPath = match[1];

      // 对于相对路径文件导入，递归处理
      if (importPath.startsWith('./') || importPath.includes('/')) {
        const importFullPath = path.resolve(cssDir, importPath);
        if (fs.existsSync(importFullPath)) {
          console.log(`处理导入的CSS文件: ${importFullPath}`);
          const importedCssContent = processCssFile(importFullPath);

          // 为导入的CSS文件创建独立的资源映射
          const importRelativePath = importFullPath.replace(path.resolve(process.cwd(), 'assets'), '');
          const importAssetPath = `/assets${importRelativePath.replace(/\\/g, '/')}`;

          if (!assetMap.has(importAssetPath)) {
            assetMap.set(importAssetPath, createAssetEntry(importedCssContent, 'text/css'));
            console.log(`已为导入的CSS文件创建映射: ${importAssetPath}`);
          }
        }
      }
    }

    // 处理CSS内容：移除import语句，保留自定义CSS
    let cssContent = originalContent.replace(importRegex, '');

    // 使用csso压缩CSS内容
    console.log(`使用csso压缩CSS文件: ${cssPath}`);
    const minifiedCss = csso.minify(cssContent).css;

    // 缓存处理后的内容
    processedCssCache.set(cssPath, minifiedCss);
    return minifiedCss;
  } catch (error) {
    console.error(`处理CSS文件出错 ${cssPath}:`, error);
    // 如果处理失败，尝试读取原始CSS内容
    try {
      return fs.readFileSync(cssPath, 'utf-8');
    } catch (readError) {
      console.error(`读取原始CSS文件失败 ${cssPath}:`, readError);
      return '';
    }
  }
}

// 使用rollup处理JS文件（只打包不压缩，支持模块导入和HTML导入）
async function processJsFile(jsPath) {
  try {
    // 检查缓存
    if (processedJsCache.has(jsPath)) {
      return processedJsCache.get(jsPath);
    }

    console.log(`使用rollup处理JS文件: ${jsPath}`);

    // 创建一个临时的rollup配置来处理单个JS文件
    const bundle = await rollup({
      input: jsPath,
      plugins: [
        nodeResolve(),
        // 使用相同的HTML处理插件，以支持递归处理HTML导入
        htmlProcessorPlugin()
      ],
      external: []
    });

    // 生成输出
    const { output } = await bundle.generate({
      format: 'es',
      compact: false // 不压缩，后面会统一由terser压缩
    });

    // 获取打包后的代码（不压缩）
    const bundledCode = output[0].code;

    // 缓存处理后的内容
    processedJsCache.set(jsPath, bundledCode);
    return bundledCode;
  } catch (error) {
    console.error(`处理JS文件出错 ${jsPath}:`, error);
    // 如果rollup处理失败，尝试直接读取文件内容作为后备
    try {
      const fallbackCode = fs.readFileSync(jsPath, 'utf-8');
      return fallbackCode;
    } catch (fallbackError) {
      console.error(`读取JS文件作为后备失败: ${jsPath}`, fallbackError);
      throw error;
    }
  }
}

// 处理HTML文件中的CSS和JS引用
async function processHtmlFile(htmlPath) {
  try {
    // 检查缓存
    if (processedHtmlCache.has(htmlPath)) {
      return processedHtmlCache.get(htmlPath);
    }

    // 读取HTML内容
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const htmlDir = path.dirname(htmlPath);

    // 1. 处理CSS文件 - 简化处理，移除tailwindcss特殊处理
    htmlContent = htmlContent.replace(/<link\s+rel="stylesheet"\s+href="(?!https:\/\/)(\.?\/?[^"]+)"\s*\/?>/g, (match, cssFilePath) => {
      try {
        const cssFullPath = cssFilePath.startsWith('.')
          ? path.resolve(htmlDir, cssFilePath)
          : path.resolve(htmlDir, 'assets', cssFilePath);

        if (fs.existsSync(cssFullPath)) {
          // 使用简化的CSS处理函数
          let cssContent = processCssFile(cssFullPath);

          // 构建/assets路径，确保使用正斜杠
          const relativePath = cssFullPath.replace(path.resolve(process.cwd(), 'assets'), '');
          const assetPath = `/assets${relativePath.replace(/\\/g, '/')}`;

          // 将处理后的CSS内容添加到资源映射中
          assetMap.set(assetPath, createAssetEntry(cssContent, 'text/css'));

          console.log(`已处理CSS文件并映射到: ${assetPath}`);

          // 返回简化的link标签
          return `<link rel="stylesheet" href="${assetPath}" />`;
        }
        console.warn(`CSS文件未找到: ${cssFullPath}`);
        return match;
      } catch (error) {
        console.error(`处理CSS文件出错 ${cssFilePath}:`, error);
        return match;
      }
    });

    // 2. 处理JS文件
    // 2.1 先找到所有module类型的JS引用（使用rollup处理）
    const moduleJsMatches = [];
    htmlContent.replace(/<script\s+type="module"\s+src="(?!https:\/\/)([^"]+)"\s*\/?><\/script>/g, (match, jsFilePath) => {
      moduleJsMatches.push({ match, jsFilePath });
      return match;
    });

    // 2.2 找到所有普通JS引用（后续统一压缩）
    const regularJsMatches = [];
    htmlContent.replace(/<script\s+(?!type="module")[^>]*src="(?!https:\/\/)([^"]+)"\s*\/?><\/script>/g, (match, jsFilePath) => {
      regularJsMatches.push({ match, jsFilePath });
      return match;
    });

    // 统一处理所有JS文件的队列
    const allJsToProcess = [];

    // 2.3 处理module类型的JS文件（使用rollup处理后加入统一队列）
    for (const { match, jsFilePath } of moduleJsMatches) {
      try {
        const jsFullPath = jsFilePath.startsWith('.')
          ? path.resolve(htmlDir, jsFilePath)
          : path.resolve(htmlDir, 'assets', jsFilePath);

        if (fs.existsSync(jsFullPath)) {
          // 使用processJsFile函数处理JS文件（只rollup打包不压缩）
          const bundledJs = await processJsFile(jsFullPath);

          // 将rollup处理后的代码加入统一处理队列
          allJsToProcess.push({
            match,
            jsFilePath,
            content: bundledJs,
            isModule: true
          });
        } else {
          console.warn(`JS文件未找到: ${jsFullPath}`);
        }
      } catch (error) {
        console.error(`处理JS文件出错 ${jsFilePath}:`, error);
        // 出错时保留原始引用
      }
    }

    // 2.4 将普通JS文件加入统一处理队列
    for (const { match, jsFilePath } of regularJsMatches) {
      try {
        const jsFullPath = jsFilePath.startsWith('.')
          ? path.resolve(htmlDir, jsFilePath)
          : path.resolve(htmlDir, 'assets', jsFilePath);

        if (fs.existsSync(jsFullPath)) {
          // 读取普通JS文件内容
          const jsContent = fs.readFileSync(jsFullPath, 'utf-8');

          // 加入统一处理队列
          allJsToProcess.push({
            match,
            jsFilePath,
            content: jsContent,
            isModule: false
          });
        } else {
          console.warn(`JS文件未找到: ${jsFullPath}`);
        }
      } catch (error) {
        console.error(`读取JS文件出错 ${jsFilePath}:`, error);
        // 出错时保留原始引用
      }
    }

    // 2.5 统一处理所有JS文件（使用terser压缩）
    for (const { match, jsFilePath, content } of allJsToProcess) {
      try {
        let jsContent = content;

        // 使用terser统一压缩所有JS代码
        try {
          const minified = await minify(jsContent, { compress: { passes: 2 }, mangle: { toplevel: true } });

          if (minified.error) {
            console.warn(`JS压缩失败，使用原始内容: ${jsFilePath}`, minified.error);
          } else if (minified.code !== undefined) {
            jsContent = minified.code;
            console.log(`已使用terser压缩JS文件: ${jsFilePath}`);
          }
        } catch (minifyError) {
          console.warn(`JS压缩过程出错，使用原始内容: ${jsFilePath}`, minifyError);
        }

        // 构建/assets路径
        const jsFullPath = jsFilePath.startsWith('.')
          ? path.resolve(htmlDir, jsFilePath)
          : path.resolve(htmlDir, 'assets', jsFilePath);
        // 构建/assets路径，确保使用正斜杠
        const relativePath = jsFullPath.replace(path.resolve(process.cwd(), 'assets'), '').replace(/\\/g, '/');
        const assetPath = `/assets${relativePath}`;
        // 将处理后的JS内容添加到资源映射中
        assetMap.set(assetPath, createAssetEntry(jsContent, 'application/javascript'));

        // 替换为指向/assets路径的引用
        htmlContent = htmlContent.replace(match, `<script src="${assetPath}"></script>`);
        console.log(`已处理JS文件并映射到: ${assetPath}`);
      } catch (error) {
        console.error(`处理JS文件出错 ${jsFilePath}:`, error);
        // 出错时保留原始引用
      }
    }

    // 使用html-minifier-terser进行专业HTML压缩
    try {
      const minifiedHtml = await minifyHtml(htmlContent, {
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        decodeEntities: true,
        html5: true,
        minifyCSS: false, // CSS已经在前面步骤中压缩过了
        minifyJS: false, // JS已经在前面步骤中压缩过了
        removeComments: true,
        removeEmptyAttributes: true,
        removeRedundantAttributes: true,
        sortAttributes: true,
        sortClassName: true
      });
      htmlContent = minifiedHtml;
      console.log(`已使用html-minifier-terser压缩HTML文件: ${htmlPath}`);
    } catch (htmlMinifyError) {
      console.warn(`HTML压缩失败，使用原始内容: ${htmlPath}`, htmlMinifyError);
    }

    // 缓存处理后的内容
    processedHtmlCache.set(htmlPath, htmlContent);
    return htmlContent;
  } catch (error) {
    console.error(`处理HTML文件出错 ${htmlPath}:`, error);
    throw error;
  }
}

// 自定义HTML处理插件
function htmlProcessorPlugin() {
  return {
    name: 'html-processor-plugin',

    // 加载HTML文件并处理其中的CSS和JS引用
    async load(id) {
      if (id.endsWith('.html')) {
        try {
          // 处理HTML文件，包括CSS压缩和JS编译
          const processedHtml = await processHtmlFile(id);

          // 将处理后的HTML转换为JS模块导出
          const escapedHtml = JSON.stringify(processedHtml);
          return `export default ${escapedHtml};`;
        } catch (error) {
          console.error(`加载和处理HTML文件出错 ${id}:`, error);
          throw error;
        }
      }
      return null;
    },

    // 确保资源映射在转换过程中被正确处理
    transform(code, id) {
      // 对于CSS文件，确保它们被添加到资源映射中
      if (id.endsWith('.css')) {
        // 构建/assets路径，确保使用正斜杠
        const relativePath = id.replace(path.resolve(process.cwd(), 'assets'), '');
        const assetPath = `/assets${relativePath.replace(/\\/g, '/')}`;

        // 直接将CSS内容添加到资源映射中
        assetMap.set(assetPath, createAssetEntry(code, 'text/css'));
        console.log(`在transform钩子中添加CSS资源: ${assetPath}`);
      }
      return null;
    }
  };
}

// 主配置 - 从entry.js入口点开始处理
const mainConfig = {
  input: 'entry.js',
  output: {
    file: 'dist/worker.js',
    format: 'es',
    compact: false // 不启用压缩
  },
  plugins: [
    nodeResolve(),
    htmlProcessorPlugin(), // 先处理HTML和资源，填充assetMap
    assetMapReplacementPlugin(), // 替换handler.js中的assets对象为实际资源映射
    rollupTerser({
      // 保留assets变量名不被替换
      mangle: {
        reserved: ['assets']
      }
    }),         // 最后压缩代码，保留assets变量名
    {
      name: 'post-build-terser',
      // 在输出文件后执行额外的terser压缩
      async writeBundle(options, bundle) {
        // 找到worker.js文件
        const workerFile = Object.values(bundle).find(file =>
          file.fileName === 'worker.js'
        );

        if (workerFile) {
          console.log('开始使用terser对worker.js进行额外压缩，不保留变量名...');
          const workerPath = path.resolve('dist', 'worker.js');
          const workerContent = fs.readFileSync(workerPath, 'utf8');

          // 使用terser进行最大程度压缩，不保留任何变量名
          const result = await minify(workerContent, {
            mangle: {
              toplevel: true,
              eval: true,
              keep_fnames: false,
              // 不保留assets变量名，允许完全压缩
            },
            compress: {
              passes: 5,
              drop_console: true,
              drop_debugger: true,
              dead_code: true,
              conditionals: true,
              booleans: true,
              unused: true,
              if_return: true,
              join_vars: true,
              reduce_vars: true,
              pure_funcs: ['console.log', 'console.debug', 'console.info'],
              pure_getters: true,
              unsafe: true,
              unsafe_arrows: true,
              unsafe_comps: true,
              unsafe_Function: true,
              unsafe_math: true,
              unsafe_methods: true,
              unsafe_proto: true,
              unsafe_regexp: true,
              unsafe_undefined: true
            },
            format: {
              comments: false,
              ascii_only: true,
              wrap_func_args: false
            }
          });

          if (result.error) {
            console.error('terser额外压缩失败:', result.error);
          } else {
            // 写回压缩后的内容
            fs.writeFileSync(workerPath, result.code);
            console.log('worker.js额外压缩完成');
          }
        }
      }
    }
  ],
  // 确保按正确顺序处理依赖
  preserveModules: false
};

// 创建资源映射替换插件 - 在最终生成时替换资源映射
function assetMapReplacementPlugin() {
  return {
    name: 'asset-map-replacement',

    // 在所有资源处理完成并生成最终bundle时替换assets对象
    generateBundle(options, bundle) {
      console.log('generateBundle钩子执行，开始替换资源映射');
      console.log('最终资源映射数量:', assetMap.size);

      // 生成最终的资源映射对象字符串
      function generateAssetMapping(assetMap) {
        return '{' + Array.from(assetMap.entries()).map(([path, entry]) => {
          // 确保处理新格式的条目
          if (entry && typeof entry === 'object' && 'content' in entry && 'type' in entry) {
            return `"${path}": { "content": "${escapeJsString(entry.content)}", "type": "${entry.type}" }`;
          } else {
            // 向后兼容，处理旧格式的字符串内容
            let contentType = 'text/plain';
            if (path.includes('/assets/import/tailwindcss') || path.endsWith('.css')) {
              contentType = 'text/css';
            } else if (path.endsWith('.js')) {
              contentType = 'application/javascript';
            }
            return `"${path}": { "content": "${escapeJsString(entry)}", "type": "${contentType}" }`;
          }
        }).join(', ') + '}';
      }

      // 获取最终的资源映射内容
      const finalAssets = Object.fromEntries(assetMap);
      console.log('资产映射内容:', Object.keys(finalAssets));

      // 遍历所有生成的chunk
      for (const fileName in bundle) {
        if (bundle[fileName].type === 'chunk') {
          const chunk = bundle[fileName];
          console.log(`检查chunk: ${fileName}`);

          // 尝试多种替换模式，确保找到assets对象
          const pattern = /let\s+assets\s*=\s*\{[\s\S]*?\};?/;

          let replaced = false;
          if (pattern.test(chunk.code)) {
            console.log(`使用模式匹配到assets对象，准备替换`);
            chunk.code = chunk.code.replace(pattern, `let assets = ${JSON.stringify(finalAssets)};`);
            replaced = true;
            break;
          }

          if (replaced) {
            console.log(`已成功替换assets对象，资源映射数量:`, Object.keys(finalAssets).length);
          } else {
            console.log(`警告: 未在chunk中找到assets对象定义模式`);
            // 保存原始代码以供调试
            const debugCode = chunk.code.substring(0, 500);
            console.log(`代码片段前500字符:`, debugCode);
          }
        }
      }
    }
  };
}

// 导出主配置
export default mainConfig;