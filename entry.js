import { handleFormSubmission, handleAssetRequest } from "./handler.js";

/**
 * Cloudflare Worker 的主请求处理函数
 * 这是应用程序的入口点
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // --- 路由处理 ---
        // 处理/assets路径的资源请求
        if (url.pathname.startsWith('/assets')) {
            return handleAssetRequest(request, url, env);
        }
        // 特殊处理 /favicon.ico 和 /.well-known 请求，返回204
        else if (url.pathname === '/favicon.ico' || url.pathname.startsWith('/.well-known')) {
            return new Response(null, { status: 204 });
        }

        // 处理POST请求（表单提交）
        if (request.method === "POST") {
            return handleFormSubmission(request);
        }
        // 将所有不支持的方法重定向为 POST 请求，使用href作为body
        else {
            if (url.pathname === '/') {
                return Response.redirect('https://maps.nyase.ru', 303);
            }
            const postRequest = new Request(url.origin + '/', {
                method: 'POST',
                body: decodeURIComponent(url.pathname)
            });
            return handleFormSubmission(postRequest);
        }
    },
};