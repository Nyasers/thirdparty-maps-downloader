import { generateSearchResponse } from "./templates.js";
import { handleApiRequest, handleFormSubmission, handleAssetRequest } from "./handler.js";

/**
 * Cloudflare Worker 的主请求处理函数
 * 这是应用程序的入口点
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // --- 路由处理 ---
        // 处理/api路径的API请求
        if (url.pathname.startsWith('/api')) {
            return handleApiRequest(request, url);
        }
        // 处理/assets路径的资源请求
        else if (url.pathname.startsWith('/assets')) {
            return handleAssetRequest(request, url, env);
        }
        // 特殊处理 /favicon.ico 和 /.well-known 请求，返回204
        else if (url.pathname === '/favicon.ico' || url.pathname.startsWith('/.well-known')) {
            return new Response(null, { status: 204 });
        }
        // 将所有非根路径、非API请求和非资源请求重定向到主页
        else if (url.pathname !== "/") {
            url.pathname = '/';
            return Response.redirect(url.href, 308);
        }

        // 处理GET请求
        if (request.method === "GET") {
            return generateSearchResponse();
        }
        // 处理POST请求
        else if (request.method === "POST") {
            return handleFormSubmission(request);
        }
        // 将所有不支持的方法重定向为 GET
        else {
            return Response.redirect(url.href, 301);
        }
    },
};