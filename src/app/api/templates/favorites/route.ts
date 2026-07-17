import {
  awaitDatabaseReady,
  handleRoute,
  parseCatalogRequest,
  privatePageResponse,
  requireUser,
  templateRepository,
} from '../_shared';

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    const query = parseCatalogRequest(request);
    await awaitDatabaseReady();
    const user = await requireUser(request);
    return privatePageResponse(await templateRepository.listFavorites(user.id, query));
  });
}
