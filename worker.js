// --- FILE: worker.js (主逻辑/路由文件) ----------------------------------------
// Cloudflare Worker 框架 (ES Module)

import { assembleTemplateData, getSearchPageHtml } from "./templates.js";
import { formatBytes } from "./utils.js";
import { checkFileStatus } from "./api.js";

/**
 * 根据文件检查结果生成一个用户友好的 HTML 响应页面。
 * 负责收集所有动态数据并调用模板。
 */
function generateHtmlResponse(mapGroup, missionDisplayTitle, checkResult) {
    // 使用新的 assembleTemplateData 函数一次性完成所有数据组装和 HTML 生成
    // checkResult 包含了 { fileExists, fullCheckUrl, externalStatus, details, fileSize, finalRedirectUrl }
    const { workerStatus, htmlContent } = assembleTemplateData(
        mapGroup,
        missionDisplayTitle,
        checkResult,
        formatBytes // 传递格式化函数
    );

    return new Response(htmlContent, {
        headers: { "content-type": "text/html;charset=UTF-8" },
        status: workerStatus,
    });
}

function generateSearchResponse() {
    const htmlContent = getSearchPageHtml();
    return new Response(htmlContent, {
        headers: { "content-type": "text/html;charset=UTF-8" },
        status: 200,
    });
}

/**
 * Cloudflare Worker 的主请求处理函数。
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // --- catch-all 路由处理 ---
        // 将所有非根路径请求重定向到主页。
        if(url.pathname !== "/") {
            url.pathname = '/';
            return Response.redirect(url.href, 308);
        }
        // 如果是 GET 请求则返回搜索页
        if (request.method === "GET") {
            return generateSearchResponse();
        }
        // 如果是 POST 请求则尝试从请求体中解析 JSON 或 FormData
        else if (request.method === "POST") {
            let mapGroup, missionDisplayTitle;
            
            try {
                const contentType = request.headers.get("content-type") || "";

                // 注意：在 Cloudflare Worker 中，读取 body 只能进行一次。这里使用 try...catch 确保即使解析失败也能继续。
                const requestClone = request.clone();

                if (contentType.includes("application/json")) {
                    const body = await requestClone.json();
                    mapGroup = mapGroup || body.mapGroup;
                    missionDisplayTitle = missionDisplayTitle || body.missionDisplayTitle;
                } else if (
                    contentType.includes("application/x-www-form-urlencoded") ||
                    contentType.includes("multipart/form-data")
                ) {
                    // 处理 FormData (这是最常见的表单提交类型)
                    const formData = await requestClone.formData();
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
        // 将所有不支持的方法重定向为 GET
        else {
            return Response.redirect(url.href, 301);
        }
    },
};
