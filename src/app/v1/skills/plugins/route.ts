import { apiError, requireDemoToken } from "@/lib/api";
import { buildPluginList } from "@/lib/hashing";
import { findWorkspace } from "@/lib/mock-data";
import { paginate, parsePagination } from "@/lib/pagination";

export const runtime = "nodejs";

const DEMO_WORKSPACE_ID = "demo-workspace";

export async function GET(request: Request) {
  const authError = requireDemoToken(request);
  if (authError) return authError;

  const workspace = findWorkspace(DEMO_WORKSPACE_ID);
  if (!workspace) {
    return apiError(500, "workspace_unavailable", "The demo workspace is unavailable.");
  }

  const parsed = parsePagination(request, "plugins");
  if ("error" in parsed) {
    return apiError(400, "validation_error", parsed.error);
  }
  const page = paginate(
    buildPluginList(workspace.plugins),
    parsed.pagination,
    "plugins",
  );
  if ("error" in page) {
    return apiError(400, "validation_error", page.error);
  }
  const body = { ...page, type: "plugin" as const, plugin: {} };
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
