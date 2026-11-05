export interface Env {
  ENVIRONMENT?: string;
  FRONTEND_URL?: string;
  CORS_ORIGINS?: string;
  NOTIFICATION_QUEUE?: Queue;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const ALLOWED_ORIGINS = [
  'https://vehiclebookingapp.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
];

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const configuredOrigins = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',') : ALLOWED_ORIGINS;
  const isAllowed = configuredOrigins.includes(origin) || configuredOrigins.includes('*');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (env.FRONTEND_URL || 'https://vehiclebookingapp.pages.dev'),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'vehiclebookingapp-api',
          environment: env.ENVIRONMENT || 'production',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not Found', path: url.pathname }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  },
};
