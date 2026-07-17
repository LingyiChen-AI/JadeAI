import {
  awaitDatabaseReady,
  handleRoute,
  parseCatalogRequest,
  publicPageResponse,
  templateRepository,
} from './_shared';

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const query = parseCatalogRequest(request);
    await awaitDatabaseReady();
    return publicPageResponse(request, await templateRepository.list(query));
  });
}
