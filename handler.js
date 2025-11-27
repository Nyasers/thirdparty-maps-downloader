import { generateHtmlResponse } from "./templates.js";
import { checkFileStatus } from "./api.js";



/**
 * 处理/assets路径的资源请求
 */
export async function handleAssetRequest(request, url, env) {
    const assetPath = url.pathname;
    console.log('处理资源请求:', assetPath);

    // 创建一个新的URL，去掉/assets前缀
    const cleanPath = assetPath.replace(/^\/assets/, '');
    const newUrl = new URL(request.url);
    newUrl.pathname = cleanPath;

    // 创建一个新的请求对象，使用修改后的URL
    const newRequest = new Request(newUrl.toString(), request);

    // 使用Cloudflare Workers Static Assets来获取和返回静态资源
    try {
        return await env.ASSETS.fetch(newRequest);
    } catch (error) {
        console.error('获取静态资源失败:', error.message);
        // 如果获取失败，返回404
        return new Response(JSON.stringify({
            error: '资源不存在或获取失败',
            path: assetPath,
            details: error
        }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 404
        });
    }
}

/**
 * 处理表单提交请求
 */
export async function handleFormSubmission(request) {
    const filePath = await request.text();
    // 检查文件状态
    const checkResult = await checkFileStatus(filePath);
    // 返回 HTML 响应
    return generateHtmlResponse(filePath, checkResult);
}
