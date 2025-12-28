/**
 * Cloudflare Pages Function - DeepSeek API 代理
 * 
 * 路由: /api/deepseek/*
 * 功能: 将请求转发到 https://api.deepseek.com，绕过 CORS 限制
 */

interface Env {
    // 可以在 Cloudflare Dashboard 中配置环境变量
    DEEPSEEK_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const { request, params, env } = context;

    // 获取子路径 (例如: /api/deepseek/chat/completions -> /chat/completions)
    const path = Array.isArray(params.path) ? params.path.join('/') : params.path || '';
    const targetUrl = `https://api.deepseek.com/${path}`;

    // 获取原始请求的 headers
    const headers = new Headers(request.headers);

    // 如果环境变量中有 API Key，使用它替换（可选功能）
    // 这样可以不在前端暴露 API Key
    if (env.DEEPSEEK_API_KEY && !headers.get('Authorization')) {
        headers.set('Authorization', `Bearer ${env.DEEPSEEK_API_KEY}`);
    }

    // 移除可能导致问题的 headers
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    headers.delete('x-forwarded-proto');
    headers.delete('x-real-ip');

    try {
        // 转发请求到 DeepSeek API
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.clone().text()
                : undefined,
        });

        // 创建响应 headers（添加 CORS 支持）
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // 返回代理响应
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error('DeepSeek API Proxy Error:', error);
        return new Response(
            JSON.stringify({ error: 'Proxy Error', message: (error as Error).message }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            }
        );
    }
};

// 处理 CORS 预检请求
export const onRequestOptions: PagesFunction = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
};
