import { nodeResolve } from '@rollup/plugin-node-resolve';
import rollupTerser from '@rollup/plugin-terser';
import { minify } from 'terser';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { execSync } from 'child_process';
import * as csso from 'csso';
import { minify as minifyHtml } from 'html-minifier-terser';
import { rollup } from 'rollup';

// 确保缓存目录存在
const cacheDir = '.rollup-cache';
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

// 缓存已处理的HTML内容，避免重复处理
const processedHtmlCache = new Map();
// 缓存已处理的JS内容，避免重复处理
const processedJsCache = new Map();

// 使用rollup处理JS文件（支持模块导入和HTML导入）
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
      compact: false // 先不压缩，后面会用terser压缩
    });

    // 获取打包后的代码
    let bundledCode = output[0].code;
    
    // 使用terser压缩打包后的代码
    try {
      const minified = await minify(bundledCode, { 
        compress: { passes: 2 },
        mangle: { toplevel: true }
      });
      
      if (minified.error) {
        console.warn(`JS压缩失败，使用原始打包内容: ${jsPath}`, minified.error);
      } else if (minified.code !== undefined) {
        bundledCode = minified.code;
        console.log(`已使用terser压缩JS文件: ${jsPath}`);
      } else {
        console.warn(`JS压缩结果不包含代码，使用原始打包内容: ${jsPath}`);
      }
    } catch (error) {
      console.warn(`JS压缩过程出错，使用原始打包内容: ${jsPath}`, error);
    }

    // 缓存处理后的内容
    processedJsCache.set(jsPath, bundledCode);
    return bundledCode;
  } catch (error) {
    console.error(`处理JS文件出错 ${jsPath}:`, error);
    // 如果rollup处理失败，尝试直接读取文件内容作为后备
    try {
      const fallbackCode = readFileSync(jsPath, 'utf-8');
      try {
        const minified = await minify(fallbackCode);
        if (minified.error || minified.code === undefined) {
          return fallbackCode;
        }
        return minified.code;
      } catch (minifyError) {
        console.warn(`后备JS压缩失败，使用原始内容: ${jsPath}`, minifyError);
        return fallbackCode;
      }
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
    let htmlContent = readFileSync(htmlPath, 'utf-8');
    const htmlDir = dirname(htmlPath);

    // 1. 处理CSS文件 - 压缩并内联
    htmlContent = htmlContent.replace(/<link\s+rel="stylesheet"\s+href="(?!https:\/\/)(\.?\/?[^"]+)"\s*\/?>/g, (match, cssFilePath) => {
      try {
        const cssFullPath = cssFilePath.startsWith('.') 
          ? resolve(htmlDir, cssFilePath) 
          : resolve(htmlDir, 'assets', cssFilePath);
        
        if (existsSync(cssFullPath)) {
          let cssContent = readFileSync(cssFullPath, 'utf-8');
          
          // 使用csso进行专业的CSS压缩
          cssContent = csso.minify(cssContent).css;
          
          console.log(`已压缩并内联CSS文件: ${cssFilePath}`);
          return `<style>${cssContent}</style>`;
        }
        console.warn(`CSS文件未找到: ${cssFullPath}`);
        return match;
      } catch (error) {
        console.error(`处理CSS文件出错 ${cssFilePath}:`, error);
        return match;
      }
    });

    // 2. 处理JS文件 - 使用rollup进行模块化打包，再压缩嵌入
    // 先找到所有匹配的JS引用
    const jsMatches = [];
    htmlContent.replace(/<script\s+(?:type="module"\s+)?src="(?!https:\/\/)([^"]+)"\s*\/?><\/script>/g, (match, jsFilePath) => {
      jsMatches.push({ match, jsFilePath });
      return match;
    });
    
    // 逐个处理JS文件，支持递归处理HTML导入
    for (const { match, jsFilePath } of jsMatches) {
      try {
        const jsFullPath = jsFilePath.startsWith('.') 
          ? resolve(htmlDir, jsFilePath) 
          : resolve(htmlDir, 'assets', jsFilePath);
          
        if (existsSync(jsFullPath)) {
          // 使用processJsFile函数处理JS文件（先rollup打包再压缩）
          const bundledAndMinifiedJs = await processJsFile(jsFullPath);
          
          // 替换HTML中的script标签
          htmlContent = htmlContent.replace(match, `<script>${bundledAndMinifiedJs}</script>`);
          console.log(`已成功处理并内联JS文件: ${jsFilePath}`);
        } else {
          console.warn(`JS文件未找到: ${jsFullPath}`);
        }
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
    }
  };
}

// 主配置 - 从worker.js入口点开始处理
const mainConfig = {
  input: 'worker.js',
  output: {
    file: 'dist/worker.js',
    format: 'es',
    compact: true
  },
  plugins: [
    nodeResolve(),
    htmlProcessorPlugin(),
    rollupTerser()
  ],
  // 确保按正确顺序处理依赖
  preserveModules: false
};

// 导出主配置
export default mainConfig;