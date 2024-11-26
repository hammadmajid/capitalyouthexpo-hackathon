import { webConfig } from '../../../../server/config';
import { proxyApi } from '../../../../server/proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyApi(request, path, webConfig());
}
// DELETE (leave waiting list) and PATCH (edit review, staff) go through the same origin/CSRF checks.
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
