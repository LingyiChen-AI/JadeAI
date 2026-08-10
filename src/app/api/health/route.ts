/**
 * Readiness probe for the Electron main process.
 *
 * Deliberately does NOT touch the database: a DB failure must surface as a DB
 * failure, not as "the server never came up".
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
