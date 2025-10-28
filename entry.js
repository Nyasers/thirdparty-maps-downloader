import { generateSearchResponse } from "./templates.js";
import { handleApiRequest, handleFormSubmission } from "./handler.js";

/**
 * Cloudflare Worker 的主请求处理函数
 * 这是应用程序的入口点
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // 特殊处理 /favicon.ico 和 /.well-known 请求，返回204
        if (url.pathname === '/favicon.ico' || url.pathname.startsWith('/.well-known')) {
            return new Response(null, { status: 204 });
        }

        // --- catch-all 路由处理 ---
        // 将所有非根路径或API请求重定向到主页
        if (url.pathname !== "/" && !url.pathname.startsWith('/api')) {
            url.pathname = '/';
            return Response.redirect(url.href, 308);
        }

        // 处理GET请求
        if (request.method === "GET") {
            return generateSearchResponse();
        }
        // 处理POST请求
        else if (request.method === "POST") {
            if (url.pathname.startsWith('/api')) {
                return handleApiRequest(request, url);
            } else {
                return handleFormSubmission(request);
            }
        }
        // 将所有不支持的方法重定向为 GET
        else {
            return Response.redirect(url.href, 301);
        }
    },
};