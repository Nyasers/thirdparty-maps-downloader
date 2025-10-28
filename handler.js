import { generateHtmlResponse } from "./templates.js";
import { checkFileStatus, processL4D2ServerRequest } from "./api.js";

// 全局资源映射对象，将在构建时被替换为实际内容
// 格式: { path: { content: '...', type: 'content-type' } }
let assets = {};

/**
 * 处理API请求的代理功能
 */
export async function handleApiRequest(request, url) {
    try {
        console.log('接收到API代理请求:', url.pathname);

        // 尝试解析请求体
        let body;
        try {
            body = await request.json();
            console.log('请求体解析成功:', JSON.stringify(body).substring(0, 100) + '...');
        } catch (parseError) {
            console.error('请求体解析失败:', parseError.message);
            return new Response(JSON.stringify({ error: '请求体格式错误', details: parseError.message }), {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 400
            });
        }

        // 从路径中提取API路径（移除/api前缀）
        const apiPath = url.pathname.replace('/api', '');
        console.log('提取的API路径:', apiPath);

        // 调用api.js中的processL4D2ServerRequest函数处理l4d2server.com的请求
        const result = await processL4D2ServerRequest(apiPath, body);

        if (result.success) {
            // 返回代理响应
            return new Response(JSON.stringify(result.body), {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: result.status
            });
        } else {
            return new Response(JSON.stringify({
                error: result.error,
                details: result.details
            }), {
                headers: {
                    'Content-Type': 'application/json'
                },
                status: 500
            });
        }
    } catch (error) {
        console.error('API代理过程中发生错误:', error.message);
        return new Response(JSON.stringify({
            error: '代理服务器错误',
            details: error.message
        }), {
            headers: {
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
}

/**
 * 处理/assets路径的资源请求
 */
export function handleAssetRequest(request, url) {
    const assetPath = url.pathname;
    console.log('处理资源请求:', assetPath);

    // 从资源映射中获取对应的内容
    if (assets[assetPath]) {
        const { content, type } = assets[assetPath];

        return new Response(content, {
            headers: {
                'Content-Type': type || 'text/plain',
                'Cache-Control': 'public, max-age=3600'
            },
            status: 200
        });
    }

    // 如果资源不存在，返回404
    return new Response(JSON.stringify({
        error: '资源不存在',
        path: assetPath
    }), {
        headers: {
            'Content-Type': 'application/json'
        },
        status: 404
    });
}

/**
 * 处理表单提交请求
 */
export async function handleFormSubmission(request) {
    let mapGroup, missionDisplayTitle;

    try {
        const contentType = request.headers.get("content-type") || "";

        // 直接使用原始request对象，因为我们只读取一次请求体
        if (contentType.includes("application/json")) {
            const body = await request.json();
            mapGroup = mapGroup || body.mapGroup;
            missionDisplayTitle = missionDisplayTitle || body.missionDisplayTitle;
        } else if (
            contentType.includes("application/x-www-form-urlencoded") ||
            contentType.includes("multipart/form-data")
        ) {
            // 处理 FormData (这是最常见的表单提交类型)
            const formData = await request.formData();
            mapGroup = mapGroup || formData.get("mapGroup");
            missionDisplayTitle =
                missionDisplayTitle || formData.get("missionDisplayTitle");
        }
    } catch (e) {
        console.error("Failed to parse POST body:", e);
    }

    // 最终检查参数是否齐全
    if (!mapGroup || !missionDisplayTitle) {
        // 参数缺失时，重定向到指定 URL。
        const redirectUrl = "https://l4d2server.com/map";
        return Response.redirect(redirectUrl, 302);
    }

    // 检查文件状态
    const checkResult = await checkFileStatus(mapGroup, missionDisplayTitle);
    // 返回 HTML 响应
    return generateHtmlResponse(mapGroup, missionDisplayTitle, checkResult);
}
