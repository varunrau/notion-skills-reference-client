import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getDirectory } from "../src/app/v1/skills/directories/[directoryId]/route";
import { GET as getPlugins } from "../src/app/v1/skills/plugins/route";

const directoryContext = (directoryId: string) => ({
  params: Promise.resolve({ directoryId }),
});

describe("skills API", () => {
  const originalToken = process.env.DEMO_API_TOKEN;

  beforeEach(() => delete process.env.DEMO_API_TOKEN);
  afterEach(() => {
    if (originalToken === undefined) delete process.env.DEMO_API_TOKEN;
    else process.env.DEMO_API_TOKEN = originalToken;
  });

  it("lists plugins without workspaceId or plugin hashes", async () => {
    const response = await getPlugins(
      new Request("http://localhost/v1/skills/plugins"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspaceId).toBeUndefined();
    expect(body.plugins).toHaveLength(1);
    expect(body.plugins[0].hash).toBeUndefined();
    expect(body.plugins[0].skillDirectories).toHaveLength(2);
  });

  it("returns shallow child directory references that can be fetched again", async () => {
    const rootResponse = await getDirectory(
      new Request("http://localhost/v1/skills/directories/skill-dir-project-brief"),
      directoryContext("skill-dir-project-brief"),
    );
    const root = await rootResponse.json();

    expect(rootResponse.status).toBe(200);
    expect(root.directory).toMatchObject({
      id: "skill-dir-project-brief",
      type: "directory",
      name: "project-brief",
    });
    expect(root.contents["SKILL.md"].content).toContain("name: project-brief");
    expect(root.contents["example-homepage.html"]).toEqual({
      type: "url",
      url: "https://www.example.com/",
    });
    expect(root.contents.examples).toEqual({
      id: "skill-dir-project-brief-examples",
      type: "directory",
      name: "examples",
      updatedAt: "2026-07-14T19:00:00.000Z",
    });
    expect(root.contents.examples.contents).toBeUndefined();

    const nestedResponse = await getDirectory(
      new Request(
        "http://localhost/v1/skills/directories/skill-dir-project-brief-examples",
      ),
      directoryContext("skill-dir-project-brief-examples"),
    );
    const nested = await nestedResponse.json();
    expect(nestedResponse.status).toBe(200);
    expect(nested.directory.name).toBe("examples");
    expect(nested.contents["launch.md"].content).toContain("Launch brief example");
  });

  it("returns a conventional unknown directory error", async () => {
    const response = await getDirectory(
      new Request("http://localhost/v1/skills/directories/missing"),
      directoryContext("missing"),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "directory_not_found" },
    });
  });

  it("enforces the optional demo bearer token", async () => {
    process.env.DEMO_API_TOKEN = "secret";
    const denied = await getPlugins(
      new Request("http://localhost/v1/skills/plugins"),
    );
    const allowed = await getPlugins(
      new Request("http://localhost/v1/skills/plugins", {
        headers: { Authorization: "Bearer secret" },
      }),
    );

    expect(denied.status).toBe(401);
    expect(allowed.status).toBe(200);
  });
});
