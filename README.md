# Workspace Skills API prototype

A small Next.js prototype showing how an external agent can connect to a workspace, discover explicitly shared skills as a plugin, and incrementally install those skills as ordinary files.

The repository has no database, external service, or real Notion/Claude/Codex integration. Mock workspace content lives in [`src/lib/mock-data.ts`](src/lib/mock-data.ts); bump the plugin's `updatedAt` when editing shared skill content so clients refresh it.

## Architecture

```text
mock workspace data
        │
        ├─ plugin metadata ──────────── GET plugin list
        │
        └─ shared directory lookup ─── GET one directory's entries
                                              │ child directory IDs
reference client: list → compare updatedAt → recursively fetch → atomic replace
                                              │
                                      installed-plugins/
```

- One client connection is scoped to one workspace.
- A workspace exposes plugins; the demo exposes one “mega-plugin.”
- The plugin lists only explicitly shared root skill directories.
- Every skill contains `SKILL.md` in the common Claude/Codex skill format.
- The client owns only plugin directories recorded in its local state file.

## Local development

Requirements: Node.js 20.9+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The debug UI links to both raw API shapes and displays current plugin timestamps.

In another terminal, install the demo plugin:

```bash
pnpm reference-client sync \
  --base-url http://localhost:3000 \
  --output ./installed-plugins
```

Preview changes without writing:

```bash
pnpm reference-client sync \
  --base-url http://localhost:3000 \
  --output ./installed-plugins \
  --dry-run
```

The result is:

```text
installed-plugins/
  .notion-plugin-sync.json
  notion-workspace-skills/
    skills/
      meeting-followup/
        SKILL.md
        tone-guide.md
      project-brief/
        SKILL.md
        example-homepage.html
        reference.md
        examples/
          launch.md
```

Run the command again to see `unchanged`. Edit text in `src/lib/mock-data.ts`, restart if needed, and run it again to see `updated` and a clean replacement.

The client prints each HTTP exchange as it runs. Requests include their method,
URL, and redacted authorization header. JSON responses include the status,
useful headers, and a pretty-printed body. Remote asset responses report the
downloaded byte count instead of dumping binary data.

## API contracts

All IDs are stable strings. All error responses use `{ "error": { "code": string, "message": string } }`.

### List connected-workspace plugins

```http
GET /v1/skills/plugins
Authorization: Bearer <optional-token>
```

```json
{
  "plugins": [
    {
      "id": "notion-workspace-skills",
      "name": "Notion Workspace Skills",
      "description": "Skills explicitly shared with this workspace",
      "updatedAt": "2026-07-14T18:00:00.000Z",
      "skillDirectories": [
        {
          "id": "skill-dir-project-brief",
          "name": "project-brief",
          "description": "Turns a rough project idea into a structured brief",
          "updatedAt": "2026-07-14T18:00:00.000Z"
        }
      ]
    }
  ]
}
```

The workspace is implied by the authenticated connection rather than encoded in the URL or response body.

### Fetch a shared directory

```http
GET /v1/skills/directories/skill-dir-project-brief
Authorization: Bearer <optional-token>
```

```json
{
  "directory": {
    "id": "skill-dir-project-brief",
    "type": "directory",
    "name": "project-brief",
    "updatedAt": "2026-07-14T18:00:00.000Z"
  },
  "contents": {
    "SKILL.md": {
      "type": "file",
      "mimeType": "text/markdown",
      "content": "---\nname: project-brief\ndescription: ...\n---\n"
    },
    "example-homepage.html": {
      "type": "url",
      "url": "https://www.example.com/"
    },
    "examples": {
      "id": "skill-dir-project-brief-examples",
      "type": "directory",
      "name": "examples"
    }
  }
}
```

Directory entries are shallow. When an entry has `type: "directory"`, the client follows its `id` with another request to the same endpoint and repeats until it reaches files or URLs. Root and descendant directories are fetchable only when they belong to an exposed skill tree. Unknown directories return `404`; an invalid configured token returns `401`.

## Optional prototype authentication

Without `DEMO_API_TOKEN`, the API permits unauthenticated demo access. To require a bearer token locally:

```bash
DEMO_API_TOKEN=local-secret pnpm dev
```

The client reads the same environment variable, or accepts `--token local-secret`:

```bash
DEMO_API_TOKEN=local-secret pnpm reference-client sync \
  --base-url http://localhost:3000 \
  --output ./installed-plugins
```

## Incremental sync

The client compares each plugin's `updatedAt` with `installed-plugins/.notion-plugin-sync.json`. Unchanged timestamps skip that plugin's directory requests. For this prototype, changing any plugin metadata or descendant content requires bumping the plugin's `updatedAt` in the mock data.

Changed plugins are refreshed by recursively following every child directory ID. The complete tree is built in a temporary transaction directory before the existing installation is replaced. Failures roll back the prior version, full replacement removes stale files, and state is atomically updated last.

The mock `project-brief` directory includes an HTTPS URL node. The client downloads it as `example-homepage.html`; tests mock the remote response to remain deterministic. Downloads require `https:`, follow redirects only when the final URL remains HTTPS, time out after 10 seconds, and are limited to 10 MiB. Every server-provided ID, directory name, and content key is validated as a single safe path segment.

## Tests and validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests cover hashing, API success/errors/auth, recursive materialization, traversal and protocol rejection, timestamp-based unchanged skipping, stale cleanup, and interrupted-sync safety.

## Deploy to Vercel

1. Push this repository to a Git provider and import it in Vercel.
2. Keep the detected framework preset as **Next.js**.
3. Use `pnpm build` (normally auto-detected) and no custom output directory.
4. Optionally add `DEMO_API_TOKEN` under Project Settings → Environment Variables for Production and Preview.
5. Deploy. Use the resulting origin as the client’s `--base-url`.

No database, storage bucket, or other infrastructure is required. The Node.js route runtime is used for hashing.

## Security limitations

This is deliberately not a production authorization design. The single optional shared token is not OAuth, has no rotation or workspace grants, and does not identify a user or installation. Mock data is bundled into the deployment. There is no rate limiting, audit log, signature, asset malware scanning, revocation channel, or protection against a malicious server beyond client-side URL/path/size/time limits.

A production connection must be approved by a workspace admin, bind credentials to exactly one workspace, evaluate current workspace-sharing and skill permissions on every response, support revocation, isolate tenants, protect secrets, and audit access.

## Explicitly deferred

- Real Notion authentication, workspace APIs, and persistence
- Claude or Codex API calls and vendor-specific manifests
- Per-user OAuth and multi-tenant authorization
- Marketplace/discovery, plugin grouping decisions, signing, and package provenance
- Skill editing and production remote-asset hosting

For a real Notion–Claude integration, replace mock modules with an authorized Notion workspace service, persist connection/grant and sync metadata, map explicit sharing ACLs into every query, issue scoped/rotatable credentials, add revocation/auditing/rate limits, host and scan immutable assets, and generate/test Claude’s final plugin manifest and installation handshake.
