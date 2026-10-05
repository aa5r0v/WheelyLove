import { isAdmin } from "@/lib/admin";

// Target of the nginx `auth_request` subrequest that guards the 55 MB gallery
// upload path (deploy/nginx/wheelylove.conf, location /_auth/admin). nginx
// sends GET /api/internal/admin-check with the original request's headers -
// including the session cookie - and lets the upload through only on 204.
// The verdict is exactly the one the admin actions use (isAdmin from
// src/lib/admin.ts): a VALID session whose user has role=admin AND
// emailVerified=true. No session, an expired session, a plain user or an
// unverified admin all answer 403. nginx itself blocks this path from the
// outside (location ^~ /api/internal/ returns 404); the subrequest proxies
// straight to the upstream, so the block does not affect it.
export async function GET() {
  return (await isAdmin())
    ? new Response(null, { status: 204 })
    : new Response(null, { status: 403 });
}
