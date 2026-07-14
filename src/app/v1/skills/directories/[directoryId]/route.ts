import { apiError, requireDemoToken } from "@/lib/api";
import {
  directoryMetadata,
  findSharedDirectory,
  serializeDirectoryEntries,
} from "@/lib/mock-data";
import { paginate, parsePagination } from "@/lib/pagination";

export const runtime = "nodejs";

const DEMO_WORKSPACE_ID = "demo-workspace";

type RouteContext = {
  params: Promise<{ directoryId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const authError = requireDemoToken(request);
  if (authError) return authError;

  const { directoryId } = await context.params;
  const directory = findSharedDirectory(DEMO_WORKSPACE_ID, directoryId);
  if (!directory) {
    return apiError(
      404,
      "directory_not_found",
      `Directory '${directoryId}' is not shared by the connected workspace.`,
    );
  }

  const scope = `directory:${directoryId}`;
  const parsed = parsePagination(request, scope);
  if ("error" in parsed) {
    return apiError(400, "validation_error", parsed.error);
  }
  const page = paginate(
    serializeDirectoryEntries(directory),
    parsed.pagination,
    scope,
  );
  if ("error" in page) {
    return apiError(400, "validation_error", page.error);
  }

  return Response.json({
    ...directoryMetadata(directory),
    contents: { ...page, type: "content", content: {} },
  }, {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
