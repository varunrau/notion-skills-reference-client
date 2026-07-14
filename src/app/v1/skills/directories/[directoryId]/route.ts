import { apiError, requireDemoToken } from "@/lib/api";
import { findSharedDirectory, serializeDirectory } from "@/lib/mock-data";

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

  return Response.json(serializeDirectory(directory), {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
