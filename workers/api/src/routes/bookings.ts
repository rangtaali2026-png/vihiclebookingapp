import { AuthenticatedRequest, withTenantContext, requireRoles } from '../middleware/tenant';
import type { Env } from '../middleware/tenant';

export async function handleGetBookings(req: AuthenticatedRequest, env: Env): Promise<Response> {
  return withTenantContext(req, env, async (authenticatedReq) => {
    const { supabase, siteId, userId, role } = authenticatedReq.tenant!;

    // Supabase will automatically apply RLS based on the passed JWT
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*, vehicles(registration_number, model), drivers(name, mobile_number)')
      .order('scheduled_start_time', { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, siteId, data: bookings }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}