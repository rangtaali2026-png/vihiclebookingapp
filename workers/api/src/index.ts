import { handleAutoAllotBooking, handleAdminOverrideAllotment, handleCancelBooking } from './routes/dispatch';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Override',
};

function applyCors(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // 1. Handle Preflight CORS Requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      // 2. Health check route
      if (url.pathname === '/' || url.pathname === '/health') {
        return applyCors(
          new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      // 3. Dispatch routes
      if (request.method === 'POST' && url.pathname === '/api/dispatch/auto-allot') {
        const res = await handleAutoAllotBooking(request, env);
        return applyCors(res);
      }

      if (request.method === 'POST' && url.pathname === '/api/dispatch/override') {
        const res = await handleAdminOverrideAllotment(request, env);
        return applyCors(res);
      }

      if (request.method === 'POST' && url.pathname === '/api/dispatch/cancel') {
        const res = await handleCancelBooking(request, env);
        return applyCors(res);
      }

      return applyCors(
        new Response(JSON.stringify({ error: `Route not found: ${request.method} ${url.pathname}` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch (err: any) {
      console.error('[Unhandled API Worker Exception]:', err);
      return applyCors(
        new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  },
};
