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
    expect(body).toMatchObject({
      object: "list",
      type: "plugin",
      plugin: {},
      has_more: false,
      next_cursor: null,
    });
    expect(body.results).toHaveLength(1);
    expect(body.results[0].hash).toBeUndefined();
    expect(body.results[0].skillDirectories).toHaveLength(2);
  });

  it("returns shallow child directory references that can be fetched again", async () => {
    const rootResponse = await getDirectory(
      new Request("http://localhost/v1/skills/directories/skill-dir-project-brief"),
      directoryContext("skill-dir-project-brief"),
    );
    const root = await rootResponse.json();

    expect(rootResponse.status).toBe(200);
    expect(root).toMatchObject({
      id: "skill-dir-project-brief",
      type: "directory",
      name: "project-brief",
    });
    expect(root.contents).toMatchObject({
      object: "list",
      type: "content",
      content: {},
      has_more: false,
      next_cursor: null,
    });
    const entries = Object.fromEntries(
      root.contents.results.map((entry: { name: string }) => [entry.name, entry]),
    );
    expect(entries["SKILL.md"].content).toContain("name: project-brief");
    expect(entries["example-homepage.html"]).toEqual({
      name: "example-homepage.html",
      type: "url",
      url: "https://www.example.com/",
    });
    expect(entries.examples).toEqual({
      id: "skill-dir-project-brief-examples",
      type: "directory",
      name: "examples",
      updatedAt: "2026-07-14T19:00:00.000Z",
    });
    expect(entries.examples.contents).toBeUndefined();

    const nestedResponse = await getDirectory(
      new Request(
        "http://localhost/v1/skills/directories/skill-dir-project-brief-examples",
      ),
      directoryContext("skill-dir-project-brief-examples"),
    );
    const nested = await nestedResponse.json();
    expect(nestedResponse.status).toBe(200);
    expect(nested.name).toBe("examples");
    expect(nested.contents.results[0].content).toContain("Launch brief example");
  });

  it("paginates directory contents with opaque cursors", async () => {
    const firstResponse = await getDirectory(
      new Request(
        "http://localhost/v1/skills/directories/skill-dir-project-brief?page_size=1",
      ),
      directoryContext("skill-dir-project-brief"),
    );
    const first = await firstResponse.json();

    expect(first.contents.results).toHaveLength(1);
    expect(first.contents.has_more).toBe(true);
    expect(typeof first.contents.next_cursor).toBe("string");

    const secondResponse = await getDirectory(
      new Request(
        `http://localhost/v1/skills/directories/skill-dir-project-brief?page_size=1&start_cursor=${encodeURIComponent(first.contents.next_cursor)}`,
      ),
      directoryContext("skill-dir-project-brief"),
    );
    const second = await secondResponse.json();

    expect(second.contents.results).toHaveLength(1);
    expect(second.contents.results[0].name).not.toBe(
      first.contents.results[0].name,
    );
  });

  it("rejects invalid pagination parameters", async () => {
    const tooLarge = await getPlugins(
      new Request("http://localhost/v1/skills/plugins?page_size=101"),
    );
    const invalidCursor = await getPlugins(
      new Request("http://localhost/v1/skills/plugins?start_cursor=not-a-cursor"),
    );

    expect(tooLarge.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    await expect(tooLarge.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
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
