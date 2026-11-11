#!/usr/bin/env bash
set -e

WORKER_FILE="/workspaces/vihiclebookingapp/workers/api/src/index.ts"

echo "==> Updating $WORKER_FILE to support permanent driver associations..."

python3 - << 'PYEOF'
import re

worker_path = "/workspaces/vihiclebookingapp/workers/api/src/index.ts"
with open(worker_path, "r", encoding="utf-8") as f:
    code = f.read()

# ==============================================================================
# Part A: Update GET /api/fleet/vehicles to join default_driver
# ==============================================================================
# Replace vehicle select query to join default_driver
old_vehicle_get_pattern = r"(supabase\s*\.from\('vehicles'\)\s*\.select\()('[^']*')(\))"

def replace_vehicle_select(m):
    return f"{m.group(1)}'*, default_driver:drivers!default_driver_id(id, name, mobile_number, license_number, status)'{m.group(3)}"

if "default_driver:drivers!default_driver_id" not in code:
    if "from('vehicles')" in code:
        code = re.sub(old_vehicle_get_pattern, replace_vehicle_select, code, count=1)
        print("✓ Updated GET /api/fleet/vehicles query to include default_driver join.")

# ==============================================================================
# Part B: Add POST /api/fleet/vehicles/assign-driver Endpoint
# ==============================================================================
assign_driver_endpoint = """
      // POST /api/fleet/vehicles/assign-driver
      if (request.method === 'POST' && path === '/api/fleet/vehicles/assign-driver') {
        try {
          const body = await request.json() as any;
          const { vehicle_id, driver_id, driver_mobile, driver_name } = body;

          if (!vehicle_id) {
            return jsonResponse({ error: 'vehicle_id is required' }, 400, corsHeaders);
          }

          // Optional: Update driver details (mobile or name) if updated inline
          if (driver_id && (driver_mobile || driver_name)) {
            const driverUpdates: any = { updated_at: new Date().toISOString() };
            if (driver_mobile) driverUpdates.mobile_number = driver_mobile;
            if (driver_name) driverUpdates.name = driver_name;

            await supabase
              .from('drivers')
              .update(driverUpdates)
              .eq('id', driver_id);
          }

          // Update vehicle permanent default driver
          const { data: updatedVehicle, error: updateErr } = await supabase
            .from('vehicles')
            .update({
              default_driver_id: driver_id || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', vehicle_id)
            .select('*, default_driver:drivers!default_driver_id(id, name, mobile_number, license_number, status)')
            .single();

          if (updateErr) throw updateErr;

          return jsonResponse({
            success: true,
            message: driver_id ? 'Driver successfully assigned to vehicle' : 'Driver unassigned from vehicle',
            vehicle: updatedVehicle
          }, 200, corsHeaders);
        } catch (err: any) {
          console.error('Driver assignment error:', err);
          return jsonResponse({ error: err.message || 'Failed to update vehicle driver assignment' }, 500, corsHeaders);
        }
      }
"""

if "path === '/api/fleet/vehicles/assign-driver'" not in code:
    # Insert right before the dispatch routes or vehicles endpoint
    target = "// GET /api/fleet/vehicles"
    if target in code:
        code = code.replace(target, assign_driver_endpoint.strip() + "\n\n      " + target)
    else:
        # Fallback insertion before dispatch endpoint
        dispatch_target = "// GET /api/dispatch"
        code = code.replace(dispatch_target, assign_driver_endpoint.strip() + "\n\n      " + dispatch_target)
    print("✓ Added POST /api/fleet/vehicles/assign-driver endpoint.")
else:
    print("Endpoint /api/fleet/vehicles/assign-driver is already registered.")

with open(worker_path, "w", encoding="utf-8") as f:
    f.write(code)

print("✓ Successfully saved updates to workers/api/src/index.ts")
PYEOF

echo "==> Testing Cloudflare Worker compilation dry-run..."
cd /workspaces/vihiclebookingapp/workers/api
pnpm exec wrangler deploy --dry-run

echo "==> Deploying worker to Cloudflare..."
pnpm exec wrangler deploy

echo "==> Done! Both endpoints (A & B) are live."
