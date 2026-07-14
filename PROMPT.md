## Prompt for coding agent

Build a **small, isolated prototype** of a workspace-level API that exposes hosted skills to an external agent as installable plugins. The prototype should include:

1. A simple web app/API deployable to Vercel.
2. Hard-coded or locally stored mock workspace/plugin/skill data.
3. A reference TypeScript client that fetches and materializes the plugin as files on disk.
4. Clear setup, usage, and deployment instructions.

### Product model

Model the connection at the **workspace level**, not at the database level:

- One external client connects to one workspace.
- A workspace exposes one or more plugins.
- For the initial sample, expose a single “mega-plugin” containing all mock workspace skills.
- A plugin contains one or more skill directories.
- Each skill directory contains a required `SKILL.md` and may contain additional files, URLs, or nested directories.
- Skills use the standard skill format shared by Claude and Codex.
- Only explicitly workspace-shared mock skills should be exposed.

The reference client should be able to:

1. List plugins for a workspace.
2. Compare plugin versions/hashes with locally cached state.
3. Skip unchanged plugins.
4. Fetch the directories belonging to changed plugins.
5. Recursively turn the returned directory representation into files on disk.
6. Produce an installation directory that resembles:

```
installed-plugins/
  notion-workspace-skills/
    skills/
      example-skill/
        SKILL.md
        reference.md
      another-skill/
        SKILL.md
```

### Technology

Use a minimal TypeScript stack that deploys cleanly to Vercel. Prefer:

- Next.js with App Router and route handlers
- TypeScript
- No database
- No external services required
- Vitest or the simplest appropriate test framework
- Node-based TypeScript reference client

Keep dependencies and UI complexity low.

### API

Implement these routes, or an equivalently clean REST shape if framework routing requires a small adjustment.

#### List workspace plugins

```
GET /api/workspaces/:workspaceId/plugins
```

Example response:

```json
{
  "workspaceId": "demo-workspace",
  "plugins": [
    {
      "id": "notion-workspace-skills",
      "name": "Notion Workspace Skills",
      "description": "Skills explicitly shared with this workspace",
      "updatedAt": "2026-07-14T18:00:00.000Z",
      "hash": "sha256:...",
      "skillDirectories": [
        {
          "id": "skill-dir-example",
          "name": "example-skill",
          "description": "An example workspace skill",
          "updatedAt": "2026-07-14T18:00:00.000Z"
        }
      ]
    }
  ]
}
```

Requirements:

- Use stable string IDs rather than numeric IDs.
- Include both `updatedAt` and a deterministic content hash.
- The plugin hash must change whenever any plugin metadata, skill metadata, or descendant directory content changes.
- Sort inputs before hashing so the hash is deterministic.
- Support an `ETag` header using the plugin-list representation’s hash.
- Return `304 Not Modified` when the request has a matching `If-None-Match`.

#### Fetch a directory

```
GET /api/workspaces/:workspaceId/directories/:directoryId
```

Return a recursive, JSON-serializable virtual directory.

Example response:

```json
{
  "id": "skill-dir-example",
  "type": "directory",
  "name": "example-skill",
  "updatedAt": "2026-07-14T18:00:00.000Z",
  "contents": {
    "SKILL.md": {
      "type": "file",
      "mimeType": "text/markdown",
      "content": "---\nname: example-skill\ndescription: Example skill\n---\n\n# Example skill\n\nFollow these instructions..."
    },
    "reference.md": {
      "type": "file",
      "mimeType": "text/markdown",
      "content": "# Reference\n\nAdditional documentation."
    },
    "sample-audio.wav": {
      "type": "url",
      "url": "https://example.com/sample-audio.wav"
    },
    "examples": {
      "id": "skill-dir-example-examples",
      "type": "directory",
      "name": "examples",
      "contents": {
        "example.md": {
          "type": "file",
          "mimeType": "text/markdown",
          "content": "# Example"
        }
      }
    }
  }
}
```

Use a discriminated union such as:

```tsx
type DirectoryNode = {
  id: string
  type: "directory"
  name: string
  updatedAt?: string
  contents: Record<string, ContentNode>
}

type FileNode = {
  type: "file"
  mimeType: string
  content: string
}

type UrlNode = {
  type: "url"
  url: string
}

type ContentNode = DirectoryNode | FileNode | UrlNode
```

For the prototype:

- Text files should be embedded as strings.
- URL nodes should be downloaded by the reference client.
- Reject unsupported protocols; allow only `https:`.
- Add reasonable request timeouts and download-size limits.
- Validate filenames and paths so neither API data nor URL responses can write outside the intended installation directory.
- Return conventional JSON errors for unknown workspaces, plugins, and directories.

### Mock data

Include at least:

- One demo workspace.
- One plugin containing at least two skills.
- A valid `SKILL.md` in each skill.
- One nested directory.
- One additional text file.
- Optionally, one safe remote URL fixture. If a stable URL would make tests unreliable, mock URL downloading in tests.

Keep mock data in ordinary TypeScript modules so a developer can edit a skill and immediately observe a changed plugin hash.

### Minimal web UI

Create a simple debug UI at `/` that:

- Explains what the prototype demonstrates.
- Shows the demo workspace ID.
- Lists the workspace’s plugins and skills.
- Displays each plugin’s hash and `updatedAt`.
- Lets the user inspect the JSON returned by the two API shapes.
- Includes copyable commands for running the reference client.
- Links to the raw API endpoints.

The UI should be functional and tidy, but it does not need production Notion styling.

### Reference client

Create a Node/TypeScript CLI in a clearly named directory such as `reference-client/`.

Example usage:

```bash
pnpm reference-client sync \
  --base-url http://localhost:3000 \
  --workspace-id demo-workspace \
  --output ./installed-plugins
```

The client should:

1. Call the plugin-list endpoint.
2. Read a local state file such as `.notion-plugin-sync.json`.
3. Compare server plugin hashes with cached hashes.
4. Print which plugins are unchanged, updated, newly installed, or removed.
5. Fetch every skill directory for changed plugins.
6. Materialize files recursively and download URL nodes.
7. Install into a temporary staging directory first.
8. Atomically replace the existing plugin directory after a successful sync.
9. Avoid leaving a partially updated plugin if a request or write fails.
10. Remove stale files from previously installed versions.
11. Update local state only after the full sync succeeds.
12. Support `--dry-run`.
13. Produce useful, readable logs.

The client should treat the server as authoritative. If a previously installed plugin disappears from the workspace response, remove its managed installation directory, while never deleting paths outside the configured output directory.

Design the materialized plugin so it would be straightforward to add Claude- or Codex-specific manifest generation later, but do not overbuild that now.

### Authentication boundary

Do not implement full OAuth. Add a deliberately small prototype boundary:

- Support an optional `DEMO_API_TOKEN` environment variable.
- If configured, API requests must use:

```
Authorization: Bearer <token>
```

- If it is absent, allow unauthenticated local/demo access.
- Document clearly that production would use an admin-authorized workspace connection and must enforce workspace sharing and permission semantics.

Do not model per-user OAuth in this prototype.

### Validation and tests

Add focused tests for:

- Deterministic plugin hashing.
- Hash changes when descendant content changes.
- Plugin list response.
- Directory response.
- Unknown workspace and directory errors.
- Conditional request / `ETag` behavior.
- Recursive client materialization.
- Path traversal rejection, including names such as `../escape`.
- Rejection of non-HTTPS URL nodes.
- Unchanged plugin skipping.
- Stale file cleanup.
- Failure safety: an interrupted sync does not replace the last valid installation.

Also run:

- Type checking
- Linting
- Unit/integration tests
- A production build

### Documentation

Write a concise README containing:

- What the prototype demonstrates.
- Architecture and data flow.
- Exact API contracts with sample requests and responses.
- Local development steps.
- Reference client commands.
- Vercel deployment steps.
- How to set `DEMO_API_TOKEN`.
- How plugin hashes and incremental sync work.
- Security limitations.
- Explicitly deferred topics.

### Explicitly out of scope

Do not implement:

- Real Notion authentication or API access.
- Real Claude or Codex APIs.
- A marketplace.
- Database-backed persistence.
- Skill editing.
- Multi-tenant production authorization.
- A final decision about plugin grouping.
- Sophisticated manifests or package signing.
- Production-grade remote asset hosting.

### Deliverable quality bar

The final result should be a self-contained repository that another engineer can:

1. Clone.
2. Install.
3. Run locally.
4. Inspect the API in a browser.
5. Run the reference client.
6. See the mock plugin materialized on disk.
7. Edit mock skill content and verify that the plugin hash changes and only the changed plugin is re-synced.
8. Deploy the web app/API to Vercel without additional infrastructure.

When finished, provide:

- A concise implementation summary.
- The final file tree.
- Commands used for validation and their results.
- Any assumptions or small deviations from the proposed API.
- A short list of what would need to change for a real Notion–Claude integration.
