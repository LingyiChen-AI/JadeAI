import {
  awaitDatabaseReady,
  handleRoute,
  parseSlug,
  privateOkResponse,
  requireUser,
  templateRepository,
} from '../../_shared';

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleRoute(async () => {
    const slug = parseSlug(await context.params);
    await awaitDatabaseReady();
    const user = await requireUser(request);
    await templateRepository.addFavorite(user.id, slug);
    return privateOkResponse();
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleRoute(async () => {
    const slug = parseSlug(await context.params);
    await awaitDatabaseReady();
    const user = await requireUser(request);
    await templateRepository.removeFavorite(user.id, slug);
    return privateOkResponse();
  });
}
