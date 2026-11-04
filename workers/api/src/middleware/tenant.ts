// =============================================================================
// File: workers/api/src/middleware/tenant.ts
// Description: Multi-Tenant JWT Validation, Claim Extraction, and Supabase Context Injection
// Target: Cloudflare Workers (V8 Edge Runtime)
// =============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database, UserRole } from '../../../packages/shared-types/src/database.types';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  APP_ENV?: string;
}

export interface TenantContext {
  userId: string;
  siteId: string;
  role: UserRole;
  email?: string;
  supabase: SupabaseClient<Database>;
}

export interface AuthenticatedRequest extends Request {
  tenant?: TenantContext;
}

interface JwtHeader {
  alg: string;
  typ: string;
}

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  exp: number;
  app_metadata?: {
    site_id?: string;
    role?: UserRole;
    provider?: string;
    providers?: string[];
  };
  user_metadata?: {
    full_name?: string;
    employee_id?: string;
  };
  role?: string;
}

/**
 * Validates a standard Supabase HS256 JWT using Web Crypto API.
 * Operates purely on the V8 Edge without external Node crypto dependencies.
 */
async function verifyHs256Jwt(
  token: string,
  secret: string
): Promise<SupabaseJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT structure: token must have 3 segments');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Validate Algorithm
  const headerJson = JSON.parse(
    new TextDecoder().decode(base64UrlToUint8Array(headerB64))
  ) as JwtHeader;

  if (headerJson.alg !== 'HS256') {
    throw new Error(`Unsupported token algorithm: ${headerJson.alg}`);
  }

  // 2. Cryptographic Signature Verification
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const dataToVerify = enc.encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(signatureB64);

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    dataToVerify
  );

  if (!isValid) {
    throw new Error('Signature verification failed: forged or invalid token');
  }

  // 3. Expiration Check
  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlToUint8Array(payloadB64))
  ) as SupabaseJwtPayload;

  const currentEpoch = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < currentEpoch) {
    throw new Error(`Token expired at epoch ${payload.exp}`);
  }

  return payload;
}

/**
 * Converts a Base64URL encoded string to a Uint8Array.
 */
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Tenant Isolation & Auth Middleware
 * 
 * Flow:
 * 1. Extracts Authorization Bearer Token from Request headers.
 * 2. Cryptographically validates the JWT against SUPABASE_JWT_SECRET.
 * 3. Extracts `sub` (userId), `site_id`, and `role` from `app_metadata`.
 * 4. Permits Super Admin cross-site operations via `X-Tenant-Override` header.
 * 5. Instantiates an RLS-scoped Supabase Client configured to pass the caller's JWT,
 *    triggering PostgreSQL `auth.jwt()` and our `app.current_site_id()` kernel functions.
 */
export async function withTenantContext(
  request: AuthenticatedRequest,
  env: Env,
  next: (req: AuthenticatedRequest) => Promise<Response>
): Promise<Response> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.substring(7).trim();

  let payload: SupabaseJwtPayload;
  try {
    payload = await verifyHs256Jwt(token, env.SUPABASE_JWT_SECRET);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Invalid Token',
        message: err.message || 'JWT validation failed.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const userId = payload.sub;
  const userRole = (payload.app_metadata?.role as UserRole) || 'REQUESTER';
  let siteId = payload.app_metadata?.site_id;

  // Super Admin Tenant Context Switching
  // Allows enterprise administrators to query a specific plant using X-Tenant-Override
  const tenantOverride = request.headers.get('X-Tenant-Override');
  if (userRole === 'SUPER_ADMIN') {
    if (tenantOverride) {
      siteId = tenantOverride;
    }
  } else {
    // Non-super-admins cannot set arbitrary tenant overrides
    if (!siteId) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'User does not belong to any active plant tenant.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (tenantOverride && tenantOverride !== siteId) {
      return new Response(
        JSON.stringify({
          error: 'Security Violation',
          message: 'Cross-tenant impersonation attempt blocked.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Initialize RLS-Scoped Supabase Client
   * 
   * Passing `auth.headers.Authorization` with the user's JWT ensures Supabase
   * sets `request.jwt.claims` in PostgreSQL. This allows:
   * - `app.current_site_id()` to extract `site_id`
   * - `app.current_role()` to extract `role`
   * - Hardware-enforced Row-Level Security rules to execute automatically.
   */
  const customHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (userRole === 'SUPER_ADMIN' && siteId) {
    customHeaders['app.override_site_id'] = siteId;
  }

  const supabaseClient = createClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: customHeaders,
      },
    }
  );

  // Attach verified context to request object
  request.tenant = {
    userId,
    siteId: siteId || '00000000-0000-0000-0000-000000000000',
    role: userRole,
    email: payload.email,
    supabase: supabaseClient,
  };

  return next(request);
}

/**
 * Role-Based Access Control Guard Helper
 */
export function requireRoles(allowedRoles: UserRole[]) {
  return function (
    request: AuthenticatedRequest,
    env: Env,
    next: (req: AuthenticatedRequest) => Promise<Response>
  ): Promise<Response> {
    return withTenantContext(request, env, async (req) => {
      const currentRole = req.tenant?.role;

      if (!currentRole || !allowedRoles.includes(currentRole)) {
        return new Response(
          JSON.stringify({
            error: 'Forbidden',
            message: `Access denied. Required one of: [${allowedRoles.join(', ')}]`,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return next(req);
    });
  };
}