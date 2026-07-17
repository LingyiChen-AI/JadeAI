import {
  awaitDatabaseReady,
  handleRoute,
  notFoundResponse,
  parseSlug,
  publicDetailResponse,
  templateRepository,
} from '../_shared';

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleRoute(async () => {
    const slug = parseSlug(await context.params);
    await awaitDatabaseReady();
    const detail = await templateRepository.getDetail(slug);
    return detail ? publicDetailResponse(request, detail) : notFoundResponse();
  });
}
