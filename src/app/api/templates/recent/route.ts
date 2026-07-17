import {
  awaitDatabaseReady,
  handleRoute,
  parseEmptyRequest,
  privateRecentResponse,
  requireUser,
  templateRepository,
} from '../_shared';

export async function GET(request: Request): Promise<Response> {
  return handleRoute(async () => {
    parseEmptyRequest(request);
    await awaitDatabaseReady();
    const user = await requireUser(request);
    return privateRecentResponse(await templateRepository.listRecent(user.id));
  });
}
