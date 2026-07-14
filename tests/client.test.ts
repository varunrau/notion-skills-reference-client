import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  materializeDirectory,
  syncPlugins,
  type SyncState,
} from "../reference-client/sync";
import type {
  DirectoryResponse,
  PluginListResponse,
} from "../reference-client/types";

const roots: string[] = [];
const rootDirectory: DirectoryResponse = {
  directory: {
    id: "skill-one",
    type: "directory",
    name: "skill-one",
  },
  contents: {
    "SKILL.md": {
      type: "file",
      mimeType: "text/markdown",
      content: "---\nname: skill-one\ndescription: Test.\n---\n",
    },
    "remote-reference.txt": {
      type: "url",
      url: "https://www.example.com/reference.txt",
    },
    nested: {
      id: "nested-directory",
      type: "directory",
      name: "nested",
    },
  },
};

const nestedDirectory: DirectoryResponse = {
  directory: {
    id: "nested-directory",
    type: "directory",
    name: "nested",
  },
  contents: {
    "reference.md": {
      type: "file",
      mimeType: "text/markdown",
      content: "# Reference",
    },
  },
};

const currentUpdatedAt = "2026-07-14T18:00:00.000Z";

const list = (updatedAt = currentUpdatedAt): PluginListResponse => ({
  plugins: [
    {
      id: "plugin-one",
      name: "Plugin One",
      description: "Test plugin",
      updatedAt,
      skillDirectories: [
        {
          id: "skill-one",
          name: "skill-one",
          description: "Test skill",
          updatedAt: "2026-07-14T18:00:00.000Z",
        },
      ],
    },
  ],
});

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "plugin-sync-test-"));
  roots.push(root);
  return root;
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers: HeadersInit = {},
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockServer(pluginList = list()) {
  return vi.fn(
    async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v1/skills/plugins")) {
        return jsonResponse(pluginList);
      }
      if (url.endsWith("/v1/skills/directories/skill-one")) {
        return jsonResponse(rootDirectory);
      }
      if (url.endsWith("/v1/skills/directories/nested-directory")) {
        return jsonResponse(nestedDirectory);
      }
      if (url === "https://www.example.com/reference.txt") {
        return new Response("downloaded reference", {
          headers: {
            "content-length": "20",
            "content-type": "text/plain",
          },
        });
      }
      return jsonResponse({ error: { message: "not found" } }, 404);
    },
  ) as unknown as typeof fetch;
}

async function seedState(root: string, updatedAt = currentUpdatedAt) {
  const state: SyncState = {
    version: 2,
    baseUrl: "http://example.test",
    plugins: {
      "plugin-one": { updatedAt },
    },
  };
  await writeFile(
    path.join(root, ".notion-plugin-sync.json"),
    JSON.stringify(state),
  );
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("client materialization", () => {
  it("fetches child directory IDs recursively and creates their files", async () => {
    const root = await tempRoot();
    const destination = path.join(root, "skill-one");
    const fetchDirectory = vi.fn(async (id: string) => {
      if (id === "nested-directory") return nestedDirectory;
      throw new Error(`unexpected directory ${id}`);
    });
    await materializeDirectory(rootDirectory, destination, {
      fetchDirectory,
      fetchImpl: mockServer(),
    });

    expect(fetchDirectory).toHaveBeenCalledWith("nested-directory");
    await expect(readFile(path.join(destination, "SKILL.md"), "utf8")).resolves.toContain(
      "name: skill-one",
    );
    await expect(
      readFile(path.join(destination, "nested", "reference.md"), "utf8"),
    ).resolves.toBe("# Reference");
    await expect(
      readFile(path.join(destination, "remote-reference.txt"), "utf8"),
    ).resolves.toBe("downloaded reference");
  });

  it("rejects path traversal names", async () => {
    const root = await tempRoot();
    const malicious: DirectoryResponse = {
      ...rootDirectory,
      contents: {
        "../escape": { type: "file", mimeType: "text/plain", content: "bad" },
      },
    };

    await expect(
      materializeDirectory(malicious, path.join(root, "install"), {
        fetchDirectory: vi.fn(),
      }),
    ).rejects.toThrow("Unsafe path segment");
    await expect(readFile(path.join(root, "escape"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects non-HTTPS URL nodes before downloading", async () => {
    const root = await tempRoot();
    const withUrl: DirectoryResponse = {
      ...rootDirectory,
      contents: {
        "asset.txt": { type: "url", url: "http://example.com/asset.txt" },
      },
    };
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    await expect(
      materializeDirectory(withUrl, path.join(root, "install"), {
        fetchDirectory: vi.fn(),
        fetchImpl,
      }),
    ).rejects.toThrow("must use https:");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("incremental sync", () => {
  it("does not create the output directory during a dry run", async () => {
    const root = await tempRoot();
    const output = path.join(root, "not-created");

    await syncPlugins({
      baseUrl: "http://example.test",
      output,
      dryRun: true,
      fetchImpl: mockServer(),
      logger: { log: vi.fn(), error: vi.fn() },
    });

    await expect(readFile(path.join(output, ".notion-plugin-sync.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("skips a plugin whose updatedAt is unchanged", async () => {
    const root = await tempRoot();
    await seedState(root);
    const fetchImpl = mockServer();
    const log = vi.fn();

    await syncPlugins({
      baseUrl: "http://example.test",
      output: root,
      fetchImpl,
      logger: { log, error: vi.fn() },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("unchanged  plugin-one");
    const trace = log.mock.calls.flat().join("\n");
    expect(trace).toContain("→ GET http://example.test/v1/skills/plugins");
    expect(trace).toContain("← 200");
  });

  it("pretty-prints responses and redacts authorization", async () => {
    const root = await tempRoot();
    const log = vi.fn();

    await syncPlugins({
      baseUrl: "http://example.test",
      output: path.join(root, "dry-run"),
      token: "do-not-print-this-token",
      dryRun: true,
      fetchImpl: mockServer(),
      logger: { log, error: vi.fn() },
    });

    const trace = log.mock.calls.flat().join("\n");
    expect(trace).toContain("authorization: Bearer <redacted>");
    expect(trace).toContain('"plugins": [');
    expect(trace).not.toContain('"workspaceId"');
    expect(trace).not.toContain('"hash"');
    expect(trace).not.toContain("do-not-print-this-token");
  });

  it("atomically replaces a plugin, follows nested IDs, and removes stale files", async () => {
    const root = await tempRoot();
    await seedState(root, "2026-07-13T18:00:00.000Z");
    const oldPlugin = path.join(root, "plugin-one");
    await mkdir(path.join(oldPlugin, "skills", "skill-one"), { recursive: true });
    await writeFile(path.join(oldPlugin, "stale.txt"), "stale");
    const fetchImpl = mockServer();

    await syncPlugins({
      baseUrl: "http://example.test",
      output: root,
      fetchImpl,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await expect(readFile(path.join(oldPlugin, "stale.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(
        path.join(
          oldPlugin,
          "skills",
          "skill-one",
          "nested",
          "reference.md",
        ),
        "utf8",
      ),
    ).resolves.toBe("# Reference");
    await expect(
      readFile(
        path.join(
          oldPlugin,
          "skills",
          "skill-one",
          "remote-reference.txt",
        ),
        "utf8",
      ),
    ).resolves.toBe("downloaded reference");
  });

  it("removes disappeared managed plugins without touching unmanaged paths", async () => {
    const root = await tempRoot();
    await seedState(root);
    await mkdir(path.join(root, "plugin-one"), { recursive: true });
    await writeFile(path.join(root, "plugin-one", "managed.txt"), "managed");
    await mkdir(path.join(root, "keep-me"), { recursive: true });
    await writeFile(path.join(root, "keep-me", "unmanaged.txt"), "unmanaged");
    const emptyList: PluginListResponse = { plugins: [] };

    await syncPlugins({
      baseUrl: "http://example.test",
      output: root,
      fetchImpl: mockServer(emptyList),
      logger: { log: vi.fn(), error: vi.fn() },
    });

    await expect(readFile(path.join(root, "plugin-one", "managed.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(root, "keep-me", "unmanaged.txt"), "utf8")).resolves.toBe(
      "unmanaged",
    );
  });

  it("does not replace the valid installation when a directory request fails", async () => {
    const root = await tempRoot();
    await seedState(root, "2026-07-13T18:00:00.000Z");
    const validFile = path.join(root, "plugin-one", "skills", "skill-one", "SKILL.md");
    await mkdir(path.dirname(validFile), { recursive: true });
    await writeFile(validFile, "last valid installation");
    const failedFetch = vi.fn(
      async (input: string | URL | Request) => {
        if (String(input).endsWith("/v1/skills/plugins")) {
          return jsonResponse(list());
        }
        return jsonResponse({ error: { message: "interrupted" } }, 500);
      },
    ) as unknown as typeof fetch;

    await expect(
      syncPlugins({
        baseUrl: "http://example.test",
        output: root,
        fetchImpl: failedFetch,
        logger: { log: vi.fn(), error: vi.fn() },
      }),
    ).rejects.toThrow("interrupted");

    await expect(readFile(validFile, "utf8")).resolves.toBe("last valid installation");
    await expect(
      readFile(path.join(root, ".notion-plugin-sync.json"), "utf8"),
    ).resolves.toContain("2026-07-13T18:00:00.000Z");
  });
});
