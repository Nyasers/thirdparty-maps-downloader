import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// 确保缓存目录存在
const cacheDir = '.rollup-cache';
if (!existsSync(cacheDir)) {
  mkdirSync(cacheDir, { recursive: true });
}

// 预处理HTML文件，内联本地CSS和JS引用
function preprocessHtmlFiles() {
  // 创建一个临时目录存放预处理后的HTML文件
  const tempDir = resolve('.temp');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  
  // 读取assets目录中的HTML文件
  const assetsDir = resolve('assets');
  const htmlFiles = readdirSync(assetsDir).filter(file => file.endsWith('.html'));
  
  // 处理每个HTML文件
  htmlFiles.forEach(fileName => {
    const htmlPath = resolve(assetsDir, fileName);
    const tempHtmlPath = resolve(tempDir, fileName);
    
    try {
      // 读取HTML内容
      let htmlContent = readFileSync(htmlPath, 'utf-8');
      
      // 内联CSS文件 - 只处理本地文件，不处理CDN链接
      htmlContent = htmlContent.replace(/<link\s+rel="stylesheet"\s+href="(?!https:\/\/)(\.?\/?[^"]+)"\s*\/?>/g, (match, cssFilePath) => {
        try {
          const cssFullPath = resolve(assetsDir, cssFilePath);
          if (existsSync(cssFullPath)) {
            const cssContent = readFileSync(cssFullPath, 'utf-8');
            console.log(`内联CSS文件: ${cssFilePath} 到 ${fileName}`);
            return `<style>${cssContent}</style>`;
          }
          console.warn(`CSS文件未找到: ${cssFullPath}`);
          return match;
        } catch (error) {
          console.error(`内联CSS文件出错 ${cssFilePath}:`, error);
          return match;
        }
      });
      
      // 内联JS文件 - 只处理本地文件，不处理CDN链接
      // 修改正则表达式以更好地匹配script标签，特别是带有type属性的
      htmlContent = htmlContent.replace(/<script\s+(?:type="module"\s+)?src="(?!https:\/\/)([^"]+)"\s*\/?><\/script>/g, (match, jsFilePath) => {
        try {
          console.log(`尝试内联JS文件: ${jsFilePath} 到 ${fileName}`);
          
          // 对于search-script.js，使用构建到临时目录的版本
          if (jsFilePath.includes('search-script.js')) {
            const builtJsPath = resolve('.temp/search-script.js');
            if (existsSync(builtJsPath)) {
              const jsContent = readFileSync(builtJsPath, 'utf-8');
              console.log(`内联临时构建的JS文件: ${jsFilePath} 到 ${fileName}`);
              return `<script>${jsContent}</script>`;
            } else {
              console.warn(`临时构建的JS文件未找到: ${builtJsPath}`);
              // 如果构建后的文件不存在，尝试使用原始文件
              const jsFullPath = resolve(assetsDir, 'search-script.js');
              if (existsSync(jsFullPath)) {
                const jsContent = readFileSync(jsFullPath, 'utf-8');
                console.log(`使用原始JS文件: ${jsFilePath} 到 ${fileName}`);
                return `<script>${jsContent}</script>`;
              }
              return match;
            }
          } else {
            // 对于其他JS文件，使用原始版本
            let jsFullPath;
            if (jsFilePath.startsWith('../')) {
              // 处理相对路径
              jsFullPath = resolve(assetsDir, '..', jsFilePath.substring(3));
            } else {
              jsFullPath = resolve(assetsDir, jsFilePath);
            }
            if (existsSync(jsFullPath)) {
              const jsContent = readFileSync(jsFullPath, 'utf-8');
              console.log(`内联JS文件: ${jsFilePath} 到 ${fileName}`);
              return `<script>${jsContent}</script>`;
            }
            console.warn(`JS文件未找到: ${jsFullPath}`);
            return match;
          }
        } catch (error) {
          console.error(`内联JS文件出错 ${jsFilePath}:`, error);
          return match;
        }
      });
      
      // 保存预处理后的HTML文件
      writeFileSync(tempHtmlPath, htmlContent, 'utf-8');
      console.log(`已预处理HTML文件: ${fileName}`);
    } catch (error) {
      console.error(`预处理HTML文件出错 ${fileName}:`, error);
    }
  });
  
  // 返回临时目录路径
  return tempDir;
}

// 自定义插件：预处理HTML文件并处理导入
function htmlPreprocessPlugin() {
  let tempDir = null;
  
  return {
    name: 'html-preprocess-plugin',
    
    // 在构建开始时预处理HTML文件
    buildStart() {
      tempDir = preprocessHtmlFiles();
    },
    
    // 解析导入路径，将assets目录的HTML导入重定向到临时目录
    resolveId(source, importer) {
      if (source.includes('assets/') && source.endsWith('.html')) {
        const fileName = source.split('assets/')[1];
        const tempHtmlPath = resolve(tempDir, fileName);
        if (existsSync(tempHtmlPath)) {
          return tempHtmlPath;
        }
      }
      return null;
    },
    
    // 加载预处理后的HTML文件并转换为JS模块
    load(id) {
      if (id.startsWith(resolve('.temp')) && id.endsWith('.html')) {
        try {
          const htmlContent = readFileSync(id, 'utf-8');
          // 使用JSON.stringify进行更安全的HTML内容转义
          const escapedHtml = JSON.stringify(htmlContent);
          return `export default ${escapedHtml};`;
        } catch (error) {
          console.error(`加载预处理后的HTML文件出错 ${id}:`, error);
          return null;
        }
      }
      return null;
    }
  };
}

// 简化版HTML处理插件，仅用于处理HTML导入
function simpleHtmlPlugin() {
  return {
    name: 'simple-html-plugin',
    transform(code, id) {
      if (id.endsWith('.html')) {
        try {
          // 使用JSON.stringify进行更安全的HTML内容转义
          const htmlContent = readFileSync(id, 'utf-8');
          const escapedHtml = JSON.stringify(htmlContent);
          return `export default ${escapedHtml};`;
        } catch (error) {
          console.error(`处理HTML文件出错 ${id}:`, error);
          return null;
        }
      }
      return null;
    }
  };
}

export default [
  // 配置1: search-script.js输出到临时目录（先构建这个）
  {
    input: 'assets/search-script.js',
    output: {
      file: '.temp/search-script.js',
      format: 'esm'
    },
    plugins: [
      nodeResolve(),
      // 添加简化版HTML处理插件
      simpleHtmlPlugin(),
      terser()
    ],
    external: [],
    cache: true
  },
  // 配置2: worker.js单文件输出（后构建这个，使用构建好的search-script.js）
  {
    input: 'worker.js',
    output: {
      file: 'dist/worker.js',
      format: 'esm',
      compact: true,
      // 确保所有依赖都被内联到worker.js中
      preserveModules: false
    },
    plugins: [
      nodeResolve(),
      htmlPreprocessPlugin(), // 预处理HTML文件并内联本地引用
      terser()
    ],
    external: [], // 没有外部依赖，所有代码都打包进worker.js
    // 启用持久化缓存
    cache: true
  }
];