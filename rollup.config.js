import * as fs from 'fs';
import * as path from 'path';
import * as rollup from 'rollup';
import * as pluginNodeResolve from '@rollup/plugin-node-resolve';
import rollupTerser from '@rollup/plugin-terser';
import * as csso from 'csso';
import * as terser from 'terser';
import * as htmlMinifierTerser from 'html-minifier-terser';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';

// 生成内容的哈希值，用于资源命名
// 使用base64url编码生成更短的哈希值，比hex编码更紧凑
function generateHash(content) {
  return crypto.createHash('MD5').update(content).digest('base64url');
}

// 映射表，存储原始路径到哈希路径的映射
const originalToHashedPathMap = new Map();
// 存储外部资源URL到哈希路径的映射
const externalResourceMap = new Map();

// 生成哈希化的资源路径
function generateHashedAssetPath(originalPath, content) {
  // 检查是否已经为这个原始路径生成过哈希路径
  if (originalToHashedPathMap.has(originalPath)) {
    return originalToHashedPathMap.get(originalPath);
  }

  // 生成哈希值
  const hash = generateHash(content);
  // 创建新的哈希路径，不需要扩展名，通过HTTP头指定内容类型
  const hashedPath = `/assets/${hash}`;

  // 存储映射关系
  originalToHashedPathMap.set(originalPath, hashedPath);

  return hashedPath;
}

// 下载外部资源
async function downloadExternalResource(url) {
  console.log(`🔄 开始下载外部资源: ${url}`);

  // 如果已经缓存过，直接返回
  if (externalResourceMap.has(url)) {
    console.log(`✅ 外部资源已缓存: ${url}`);
    return externalResourceMap.get(url);
  }

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    console.log(`🌐 使用协议: ${protocol === https ? 'HTTPS' : 'HTTP'}`);

    protocol.get(url, (res) => {
      console.log(`📡 收到响应，状态码: ${res.statusCode}`);

      if (res.statusCode !== 200) {
        console.warn(`❌ 下载失败，状态码: ${res.statusCode}，保留原始URL`);
        // 按照要求，下载失败时保留原始URL
        const fallbackEntry = { path: url, content: '', type: 'text/plain' };
        externalResourceMap.set(url, fallbackEntry);
        resolve(fallbackEntry);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf8');
        const contentType = res.headers['content-type'] || 'text/plain';

        console.log(`📥 下载完成，内容大小: ${content.length} 字节，内容类型: ${contentType}`);

        // 生成哈希路径
        const hashedPath = generateHashedAssetPath(`external_${url}`, content, '');

        // 存储外部资源映射
        const resourceEntry = { path: hashedPath, content, type: contentType };
        externalResourceMap.set(url, resourceEntry);

        console.log(`✅ 外部资源下载成功并映射: ${url} -> ${hashedPath}`);
        resolve(resourceEntry);
      });
    }).on('error', (err) => {
      console.error(`❌ 下载外部资源出错: ${url}`, err.message);
      // 按照要求，下载出错时保留原始URL
      const fallbackEntry = { path: url, content: '', type: 'text/plain' };
      externalResourceMap.set(url, fallbackEntry);
      console.warn(`⚠️  下载出错，保留原始URL: ${url}`);
      resolve(fallbackEntry);
    });
  });
}

// 缓存目录路径
const distDir = 'dist';

// 清空缓存文件夹的函数
function clearCacheDir() {
  try {
    if (fs.existsSync(distDir)) {
      console.log(`清空缓存文件夹: ${distDir}`);
      const files = fs.readdirSync(distDir);
      for (const file of files) {
        const filePath = path.join(distDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          // 递归删除子目录
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          // 删除文件
          fs.unlinkSync(filePath);
        }
      }
      console.log('缓存文件夹已清空');
    }
  } catch (error) {
    console.error(`清空缓存文件夹时出错:`, error);
  }
}

// 每次编译前清空缓存文件夹
clearCacheDir();

// 确保缓存目录存在
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log(`已创建缓存文件夹: ${distDir}`);
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

// 保存中间产物到磁盘（仅保存，不从磁盘加载）
function saveIntermediateFile(filePath, contentType, content) {
  try {
    // 为不同类型的中间产物创建子目录
    const intermediateDir = path.join(distDir, contentType);
    // 确保子目录存在
    if (!fs.existsSync(intermediateDir)) {
      fs.mkdirSync(intermediateDir, { recursive: true });
    }

    // 获取相对于项目根目录的路径，处理不同文件夹中相同名称文件的情况
    const relativePath = path.relative(process.cwd(), filePath);
    // 替换路径分隔符为下划线，避免创建子目录结构
    const safeFileName = relativePath.replace(/\\/g, '_').replace(/\//g, '_');

    // 生成中间产物文件路径
    const intermediateFilePath = path.join(intermediateDir, safeFileName);

    // 根据内容类型设置扩展名
    let finalFilePath = intermediateFilePath;
    if (contentType === 'css' && !finalFilePath.endsWith('.css')) {
      finalFilePath += '.css';
    } else if (contentType === 'js' && !finalFilePath.endsWith('.js')) {
      finalFilePath += '.js';
    } else if (contentType === 'html' && !finalFilePath.endsWith('.html')) {
      finalFilePath += '.html';
    } else if (contentType === 'minified_js') {
      // 避免重复添加.min.js扩展名
      if (!finalFilePath.endsWith('.min.js') && !finalFilePath.endsWith('.js')) {
        finalFilePath += '.min.js';
      } else if (!finalFilePath.endsWith('.min.js') && finalFilePath.endsWith('.js')) {
        // 如果已经是.js后缀，替换为.min.js
        finalFilePath = finalFilePath.replace(/\.js$/, '.min.js');
      }
    } else if (contentType === 'minified_css') {
      // 避免重复添加.min.css扩展名
      if (!finalFilePath.endsWith('.min.css') && !finalFilePath.endsWith('.css')) {
        finalFilePath += '.min.css';
      } else if (!finalFilePath.endsWith('.min.css') && finalFilePath.endsWith('.css')) {
        // 如果已经是.css后缀，替换为.min.css
        finalFilePath = finalFilePath.replace(/\.css$/, '.min.css');
      }
    }

    // 保存到磁盘
    fs.writeFileSync(finalFilePath, typeof content === 'object' ? JSON.stringify(content, null, 2) : content);
    console.log(`已保存中间产物到磁盘: ${finalFilePath} (${fs.statSync(finalFilePath).size} 字节)`);
  } catch (error) {
    console.error(`保存中间产物到磁盘失败 ${filePath}:`, error);
  }
}

// 处理CSS文件，简化版本，移除tailwind cli依赖
function processCssFile(cssPath) {
  try {
    // 检查内存缓存（只使用内存缓存，不从磁盘加载）
    if (processedCssCache.has(cssPath)) {
      return processedCssCache.get(cssPath);
    }

    console.log(`处理CSS文件: ${cssPath}`);

    // 读取原始CSS内容
    const originalContent = fs.readFileSync(cssPath, 'utf-8');
    const importRegex = /@import\s+["']([^"']+)['"]\s*;/g;
    const cssDir = path.dirname(cssPath);

    // 存储导入的CSS文件的哈希路径，用于在HTML中添加link标签
    const importedCssPaths = [];

    // 处理导入语句
    let match;
    while ((match = importRegex.exec(originalContent)) !== null) {
      const importPath = match[1];

      // 对于相对路径文件导入，递归处理
      if (importPath.startsWith('./') || importPath.includes('/')) {
        const importFullPath = path.resolve(cssDir, importPath);
        if (fs.existsSync(importFullPath)) {
          console.log(`处理导入的CSS文件: ${importFullPath}`);
          const importedResult = processCssFile(importFullPath);
          const importedCssContent = importedResult.content;

          // 为导入的CSS文件创建独立的资源映射，使用哈希路径
          const hashedAssetPath = generateHashedAssetPath(importFullPath, importedCssContent, 'css');

          if (!assetMap.has(hashedAssetPath)) {
            assetMap.set(hashedAssetPath, createAssetEntry(importedCssContent, 'text/css'));
            console.log(`已为导入的CSS文件创建哈希映射: ${hashedAssetPath}`);
          }

          // 保存导入的CSS文件的哈希路径
          importedCssPaths.push(hashedAssetPath);

          // 合并所有嵌套导入的路径
          if (typeof importedResult === 'object' && importedResult.importedPaths) {
            importedCssPaths.push(...importedResult.importedPaths);
          }
        }
      }
    }

    // 处理CSS内容：移除import语句，保留自定义CSS
    let cssContent = originalContent.replace(importRegex, '');

    // 使用csso压缩CSS内容
    console.log(`使用csso压缩CSS文件: ${cssPath}`);
    const minifiedCss = csso.minify(cssContent).css;

    // 创建返回对象，包含压缩后的CSS内容和导入的CSS路径
    const result = {
      content: minifiedCss,
      importedPaths: importedCssPaths
    };

    // 缓存处理后的内容到内存
    processedCssCache.set(cssPath, result);
    // 保存原始CSS内容（移除import后的内容）到磁盘
    saveIntermediateFile(cssPath, 'css', cssContent);
    // 保存压缩后的CSS内容
    saveIntermediateFile(cssPath, 'minified_css', result.content);
    return result;
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
    // 检查内存缓存（只使用内存缓存，不从磁盘加载）
    if (processedJsCache.has(jsPath)) {
      return processedJsCache.get(jsPath);
    }

    console.log(`使用rollup处理JS文件: ${jsPath}`);

    // 创建一个临时的rollup配置来处理单个JS文件
    const bundle = await rollup.rollup({
      input: jsPath,
      plugins: [
        pluginNodeResolve.nodeResolve(),
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

    // 缓存处理后的内容到内存
    processedJsCache.set(jsPath, bundledCode);
    // 保存中间产物到磁盘（保存rollup处理后的JS）
    saveIntermediateFile(jsPath, 'js', bundledCode);
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
    // 检查内存缓存（只使用内存缓存，不从磁盘加载）
    if (processedHtmlCache.has(htmlPath)) {
      return processedHtmlCache.get(htmlPath);
    }

    // 读取HTML内容
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const htmlDir = path.dirname(htmlPath);

    // 1. 处理CSS文件 - 包括内部和外部CSS
    htmlContent = await (async () => {
      let result = htmlContent;

      // 处理外部CSS链接
      // 先匹配包含rel="stylesheet"的link标签，再从中提取href属性
      const externalCssRegex = /<link\s+[^>]*?rel=(?:"|')stylesheet(?:"|')[^>]*?\/?>/gs;
      const externalCssMatches = [...result.matchAll(externalCssRegex)];
      console.log(`🔍 找到 ${externalCssMatches.length} 个外部CSS链接`);

      for (const match of externalCssMatches) {
        try {
          // 从整个匹配的标签中提取href属性值（支持单引号和双引号）
          const hrefMatch = match[0].match(/href=(?:"|')(https?:\/\/[^"\']+)(?:"|')/);
          if (!hrefMatch) continue;

          const externalUrl = hrefMatch[1];
          console.log(`📄 处理外部CSS链接: ${externalUrl}`);
          // 下载外部资源
          const resource = await downloadExternalResource(externalUrl);

          if (resource.path !== externalUrl) { // 下载成功，使用本地路径
            // 将外部资源添加到assetMap
            assetMap.set(resource.path, createAssetEntry(resource.content, resource.type));
            // 简化处理：只保留必要的rel和新的href属性，不再保存其他原始属性
            result = result.replace(match[0], `<link rel="stylesheet" href="${resource.path}" />`);
            console.log(`✅ 已替换外部CSS链接: ${externalUrl} -> ${resource.path}`);
          } else {
            // 下载失败，保留原始链接
            console.log(`⚠️  保留原始CSS链接: ${externalUrl}`);
          }
        } catch (error) {
          console.error(`❌ 处理外部CSS失败: ${match[1]}`, error.message);
          // 保留原始链接作为后备
        }
      }

      // 处理内部CSS文件
      result = result.replace(/<link\s+rel="stylesheet"\s+href="(?!https:\/\/)(\.?\/?[^"]+)"\s*\/?>/g, (match, cssFilePath) => {
        try {
          const cssFullPath = cssFilePath.startsWith('.')
            ? path.resolve(htmlDir, cssFilePath)
            : path.resolve(htmlDir, 'assets', cssFilePath);

          if (fs.existsSync(cssFullPath)) {
            // 使用简化的CSS处理函数，获取处理结果（包含导入的CSS路径）
            const cssResult = processCssFile(cssFullPath);
            const cssContent = cssResult.content;

            // 使用哈希路径替代原始路径
            const hashedAssetPath = generateHashedAssetPath(cssFullPath, cssContent, 'css');

            // 将处理后的CSS内容添加到资源映射中
            assetMap.set(hashedAssetPath, createAssetEntry(cssContent, 'text/css'));

            console.log(`已处理CSS文件并映射到哈希路径: ${hashedAssetPath}`);

            // 创建导入的CSS文件的link标签
            let importLinks = '';
            if (typeof cssResult === 'object' && cssResult.importedPaths) {
              for (const importedPath of cssResult.importedPaths) {
                importLinks += `<link rel="stylesheet" href="${importedPath}" />
`;
                console.log(`已为导入的CSS添加link标签: ${importedPath}`);
              }
            }

            // 返回使用哈希路径的link标签，以及所有导入的CSS的link标签
            return importLinks + `<link rel="stylesheet" href="${hashedAssetPath}" />`;
          }
          console.warn(`CSS文件未找到: ${cssFullPath}`);
          return match;
        } catch (error) {
          console.error(`处理CSS文件出错 ${cssFilePath}:`, error);
          return match;
        }
      });

      return result;
    })();

    // 2. 处理JS文件
    // 2.1 先处理外部JS链接
    htmlContent = await (async () => {
      let result = htmlContent;

      // 处理外部JS链接（包括module和普通脚本）
      // 修改为支持多行的正则表达式，允许属性顺序不固定，支持单引号和双引号
      const externalJsRegex = /<script\s+[^>]*?src=(?:"|')(https?:\/\/[^"\']+)(?:"|')[^>]*><\/script>/gs;
      const externalJsMatches = [...result.matchAll(externalJsRegex)];
      console.log(`🔍 找到 ${externalJsMatches.length} 个外部JS链接`);

      for (const match of externalJsMatches) {
        try {
          // 从整个匹配的标签中提取src属性值（支持单引号和双引号）
          const srcMatch = match[0].match(/src=(?:"|')(https?:\/\/[^"\']+)(?:"|')/);
          if (!srcMatch) continue;

          const externalUrl = srcMatch[1];
          console.log(`📄 处理外部JS链接: ${externalUrl}`);
          // 下载外部资源
          const resource = await downloadExternalResource(externalUrl);

          if (resource.path !== externalUrl) { // 下载成功，使用本地路径
            // 将外部资源添加到assetMap
            assetMap.set(resource.path, createAssetEntry(resource.content, resource.type));

            // 简化处理：只保留必要的src属性，不再保存其他原始属性
            result = result.replace(match[0], `<script src="${resource.path}"></script>`);
            console.log(`✅ 已替换外部JS链接: ${externalUrl} -> ${resource.path}`);
          } else {
            // 下载失败，保留原始链接
            console.log(`⚠️  保留原始JS链接: ${externalUrl}`);
          }
        } catch (error) {
          console.error(`❌ 处理外部JS失败: ${match[1]}`, error.message);
          // 保留原始链接作为后备
        }
      }

      return result;
    })();

    // 2.2 找到所有内部module类型的JS引用（使用rollup处理）
    const moduleJsMatches = [];
    htmlContent.replace(/<script\s+type="module"\s+src="(?!https:\/\/)([^"]+)"\s*\/?><\/script>/g, (match, jsFilePath) => {
      moduleJsMatches.push({ match, jsFilePath });
      return match;
    });

    // 2.3 找到所有内部普通JS引用（后续统一压缩）
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
          const minified = await terser.minify(jsContent, { compress: { passes: 2 }, mangle: { toplevel: true } });

          if (minified.error) {
            console.warn(`JS压缩失败，使用原始内容: ${jsFilePath}`, minified.error);
          } else if (minified.code !== undefined) {
            jsContent = minified.code;
            console.log(`已使用terser压缩JS文件: ${jsFilePath}`);
            // 构建完整路径
            const jsFullPath = jsFilePath.startsWith('.')
              ? path.resolve(htmlDir, jsFilePath)
              : path.resolve(htmlDir, 'assets', jsFilePath);
            // 保存压缩后的JS作为中间产物
            saveIntermediateFile(jsFullPath, 'minified_js', jsContent);
          }
        } catch (minifyError) {
          console.warn(`JS压缩过程出错，使用原始内容: ${jsFilePath}`, minifyError);
        }

        // 构建完整路径
        const jsFullPath = jsFilePath.startsWith('.')
          ? path.resolve(htmlDir, jsFilePath)
          : path.resolve(htmlDir, 'assets', jsFilePath);

        // 使用哈希路径替代原始路径
        const hashedAssetPath = generateHashedAssetPath(jsFullPath, jsContent, 'js');

        // 将处理后的JS内容添加到资源映射中
        assetMap.set(hashedAssetPath, createAssetEntry(jsContent, 'application/javascript'));

        // 替换为指向哈希路径的引用
        htmlContent = htmlContent.replace(match, `<script src="${hashedAssetPath}"></script>`);
        console.log(`已处理JS文件并映射到哈希路径: ${hashedAssetPath}`);
      } catch (error) {
        console.error(`处理JS文件出错 ${jsFilePath}:`, error);
        // 出错时保留原始引用
      }
    }

    // 3. 处理其他外部资源（如字体、图片等）
    htmlContent = await (async () => {
      let result = htmlContent;

      // 处理CSS中的外部字体和图片URL
      const cssUrlRegex = /url\(\s*(?:"|')?(https?:\/\/[^"')]+)(?:"|')?\s*\)/g;
      const cssUrlMatches = [...result.matchAll(cssUrlRegex)];
      console.log(`🔍 找到 ${cssUrlMatches.length} 个CSS外部URL引用`);

      for (const match of cssUrlMatches) {
        try {
          const externalUrl = match[1];
          console.log(`🎨 处理CSS中的外部URL: ${externalUrl}`);
          // 下载外部资源
          const resource = await downloadExternalResource(externalUrl);

          if (resource.path !== externalUrl) { // 下载成功，使用本地路径
            // 将外部资源添加到assetMap
            assetMap.set(resource.path, createAssetEntry(resource.content, resource.type));
            // 替换URL
            result = result.replace(match[0], `url(${resource.path})`);
            console.log(`✅ 已替换CSS外部URL: ${externalUrl} -> ${resource.path}`);
          } else {
            // 下载失败，保留原始URL
            console.log(`⚠️  保留原始CSS外部URL: ${externalUrl}`);
          }
        } catch (error) {
          console.error(`❌ 处理CSS外部URL失败: ${match[1]}`, error.message);
          // 保留原始URL作为后备
        }
      }

      // 处理HTML中的外部图片
      const imgSrcRegex = /<img\s+[^>]*src="(https?:\/\/[^"\']+)"\s*[^>]*>/g;
      const imgMatches = [...result.matchAll(imgSrcRegex)];
      console.log(`🔍 找到 ${imgMatches.length} 个外部图片链接`);

      for (const match of imgMatches) {
        try {
          const externalUrl = match[1];
          console.log(`🖼️  处理外部图片链接: ${externalUrl}`);
          // 下载外部资源
          const resource = await downloadExternalResource(externalUrl);

          if (resource.path !== externalUrl) { // 下载成功，使用本地路径
            // 将外部资源添加到assetMap
            assetMap.set(resource.path, createAssetEntry(resource.content, resource.type));
            // 替换src属性
            result = result.replace(match[0], match[0].replace(externalUrl, resource.path));
            console.log(`✅ 已替换外部图片链接: ${externalUrl} -> ${resource.path}`);
          } else {
            // 下载失败，保留原始URL
            console.log(`⚠️  保留原始图片链接: ${externalUrl}`);
          }
        } catch (error) {
          console.error(`❌ 处理外部图片失败: ${match[1]}`, error.message);
          // 保留原始URL作为后备
        }
      }

      return result;
    })();

    // 使用html-minifier-terser进行专业HTML压缩
    try {
      const minifiedHtml = await htmlMinifierTerser.minify(htmlContent, {
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

    // 缓存处理后的HTML内容到内存
    processedHtmlCache.set(htmlPath, htmlContent);
    // 保存中间产物到磁盘
    saveIntermediateFile(htmlPath, 'html', htmlContent);
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
        // 使用哈希路径替代原始路径
        const hashedAssetPath = generateHashedAssetPath(id, code, 'css');

        // 直接将CSS内容添加到资源映射中
        assetMap.set(hashedAssetPath, createAssetEntry(code, 'text/css'));
        console.log(`在transform钩子中添加CSS资源(哈希路径): ${hashedAssetPath}`);
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
    pluginNodeResolve.nodeResolve(),
    htmlProcessorPlugin(), // 先处理HTML和资源，填充assetMap
    assetFileOutputPlugin(), // 将资源保存到dist/assets目录
    rollupTerser(),         // 压缩代码
    {
      name: 'post-build-terser',
      // 在输出文件后执行额外的terser压缩
      async writeBundle(options, bundle) {
        // 找到worker.js文件
        const workerFile = Object.values(bundle).find(file =>
          file.fileName === 'worker.js'
        );

        if (workerFile) {
          console.log('开始使用terser对worker.js进行额外压缩...');
          const workerPath = path.resolve('dist', 'worker.js');
          const workerContent = fs.readFileSync(workerPath, 'utf8');

          // 保存二次压缩前的worker.js内容
          const preCompressPath = path.join(distDir, 'worker.js');
          console.log(`二次压缩前的worker.js: ${preCompressPath} (${fs.statSync(preCompressPath).size} 字节)`);

          // 使用terser进行安全压缩，避免过度优化导致的功能问题
          const result = await terser.minify(workerContent, {
            mangle: {
              toplevel: true,
              eval: true,
              keep_fnames: false
            },
            compress: {
              // 标准压缩次数
              passes: 2,
              // 启用更激进的压缩选项
              pure_getters: true,
              toplevel: true,
              module: true,
              drop_console: true,
              drop_debugger: true,
              dead_code: true,
              conditionals: true,
              booleans: true,
              unused: true,
              if_return: true,
              join_vars: true,
              reduce_vars: true,
              hoist_funs: true,
              hoist_vars: true,
              loops: true,
              collapse_vars: true,
              inline: true,
              pure_funcs: ['console.log', 'console.debug', 'console.info', 'console.warn', 'console.error'],
              // 不安全优化选项
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
              beautify: false,
              // 使用更紧凑的语法
              braces: false,
              semicolons: false
            },
            // 启用ECMAScript最新特性以提高压缩效果
            ecma: 9999
          });

          if (result.error) {
            console.error('terser额外压缩失败:', result.error);
          } else {
            // 保存二次压缩后的worker.js内容
            const postCompressPath = path.join(distDir, 'worker.min.js');
            fs.writeFileSync(postCompressPath, result.code);
            console.log(`二次压缩后的worker.js: ${postCompressPath} (${fs.statSync(postCompressPath).size} 字节)`);
          }
        }
      }
    }
  ],
  // 确保按正确顺序处理依赖
  preserveModules: false
};

// 创建资源文件输出插件 - 将处理后的资源保存到dist/assets目录
function assetFileOutputPlugin() {
  const assetsDir = path.join(distDir, 'assets');

  return {
    name: 'asset-file-output',

    // 确保assets目录存在
    buildStart() {
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
        console.log(`已创建assets目录: ${assetsDir}`);
      }
    },

    // 在生成最终bundle之前将资源保存为文件
    generateBundle(options, bundle) {
      console.log('generateBundle钩子执行，开始输出静态资源文件');

      // 遍历所有资源并保存为文件
      for (const [assetPath, assetEntry] of assetMap.entries()) {
        // 从路径中提取文件名 (格式: /assets/hash -> hash)
        const fileName = assetPath.replace(/^\/assets\//, '');
        const filePath = path.join(assetsDir, fileName);

        try {
          fs.writeFileSync(filePath, assetEntry.content);
          console.log(`已保存静态资源: ${filePath}`);
        } catch (error) {
          console.error(`保存静态资源失败 ${filePath}:`, error);
        }
      }

      console.log(`静态资源输出完成，共 ${assetMap.size} 个文件`);
    }
  };
}

// 导出主配置
export default mainConfig;