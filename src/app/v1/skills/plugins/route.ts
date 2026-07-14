import { apiError, requireDemoToken } from "@/lib/api";
import { buildPluginList } from "@/lib/hashing";
import { findWorkspace } from "@/lib/mock-data";

export const runtime = "nodejs";

const DEMO_WORKSPACE_ID = "demo-workspace";

export async function GET(request: Request) {
  const authError = requireDemoToken(request);
  if (authError) return authError;

  const workspace = findWorkspace(DEMO_WORKSPACE_ID);
  if (!workspace) {
    return apiError(500, "workspace_unavailable", "The demo workspace is unavailable.");
  }

  const body = buildPluginList(workspace.plugins);
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
