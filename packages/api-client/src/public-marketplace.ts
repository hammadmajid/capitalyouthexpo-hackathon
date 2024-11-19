// Read-only public discovery never requires loading a mobile access token.
export function publicMarketplace(method: string, schemaPath: string): boolean {
  if (method === 'POST') return schemaPath === '/v1/marketplace/{branchId}/quote';
  return (
    (method === 'GET' || method === 'HEAD') &&
    (schemaPath === '/v1/public/hostels/{slug}/visit-slots' ||
      schemaPath === '/v1/marketplace' ||
      schemaPath.startsWith('/v1/marketplace/'))
  );
}
