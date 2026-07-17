import {
  awaitDatabaseReady,
  handleRoute,
  notFoundResponse,
  parseSlugVersion,
  publicDetailResponse,
  templateRepository,
} from '../../../_shared';

type RouteContext = { params: Promise<{ slug: string; version: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleRoute(async () => {
    const { slug, version } = parseSlugVersion(await context.params);
    await awaitDatabaseReady();
    const detail = await templateRepository.getVersion(slug, version);
    return detail ? publicDetailResponse(request, detail) : notFoundResponse();
  });
}
