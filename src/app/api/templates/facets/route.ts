import {
  awaitDatabaseReady,
  handleRoute,
  parseFacetsRequest,
  publicFacetsResponse,
  templateRepository,
} from '../_shared';

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    parseFacetsRequest(request);
    await awaitDatabaseReady();
    return publicFacetsResponse(request, await templateRepository.getFacets());
  });
}
