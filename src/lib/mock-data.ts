import type {
  DirectoryEntry,
  DirectoryNode,
  VirtualDirectory,
  WorkspaceDefinition,
} from "./types";

const updatedAt = "2026-07-14T19:00:00.000Z";

export const workspaces: WorkspaceDefinition[] = [
  {
    id: "demo-workspace",
    name: "Demo Workspace",
    plugins: [
      {
        id: "notion-workspace-skills",
        name: "Notion Workspace Skills",
        description: "Skills explicitly shared with this workspace",
        updatedAt,
        skillDirectories: [
          {
            id: "skill-dir-project-brief",
            type: "directory",
            name: "project-brief",
            description: "Turns a rough project idea into a structured brief",
            updatedAt,
            contents: {
              "SKILL.md": {
                type: "file",
                mimeType: "text/markdown",
                content:
                  "---\nname: project-brief\ndescription: Turn a rough project idea into a structured brief.\n---\n\n# Project brief\n\nAsk for the goal, audience, constraints, owner, and deadline. Produce a concise brief with decisions and open questions.\n",
              },
              "reference.md": {
                type: "file",
                mimeType: "text/markdown",
                content:
                  "# Brief checklist\n\n- State the desired outcome.\n- Name the decision maker.\n- Separate constraints from preferences.\n- Record unresolved questions.\n",
              },
              "example-homepage.html": {
                type: "url",
                url: "https://www.example.com/",
              },
              examples: {
                id: "skill-dir-project-brief-examples",
                type: "directory",
                name: "examples",
                updatedAt,
                contents: {
                  "launch.md": {
                    type: "file",
                    mimeType: "text/markdown",
                    content:
                      "# Launch brief example\n\nOutcome: ship the beta to 20 design partners by September 1.\n",
                  },
                },
              },
            },
          },
          {
            id: "skill-dir-meeting-followup",
            type: "directory",
            name: "meeting-followup",
            description: "Creates crisp follow-ups from meeting notes",
            updatedAt,
            contents: {
              "SKILL.md": {
                type: "file",
                mimeType: "text/markdown",
                content:
                  "---\nname: meeting-followup\ndescription: Create a crisp follow-up from meeting notes.\n---\n\n# Meeting follow-up\n\nSummarize decisions first, then list action items with one owner and a due date. Call out risks without inventing commitments.\n",
              },
              "tone-guide.md": {
                type: "file",
                mimeType: "text/markdown",
                content:
                  "# Tone guide\n\nBe direct, warm, and specific. Prefer short sentences and concrete dates.\n",
              },
            },
          },
        ],
      },
    ],
  },
];

export function findWorkspace(workspaceId: string) {
  return workspaces.find((workspace) => workspace.id === workspaceId);
}

function findNestedDirectory(
  directory: VirtualDirectory,
  directoryId: string,
): VirtualDirectory | undefined {
  if (directory.id === directoryId) return directory;
  for (const child of Object.values(directory.contents)) {
    if (child.type !== "directory") continue;
    const match = findNestedDirectory(child, directoryId);
    if (match) return match;
  }
}

export function findSharedDirectory(
  workspaceId: string,
  directoryId: string,
): VirtualDirectory | undefined {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) return undefined;
  for (const root of workspace.plugins.flatMap((plugin) => plugin.skillDirectories)) {
    const match = findNestedDirectory(root, directoryId);
    if (match) return match;
  }
}

export function directoryMetadata(directory: VirtualDirectory): DirectoryNode {
  return {
    id: directory.id,
    type: directory.type,
    name: directory.name,
    ...(directory.updatedAt ? { updatedAt: directory.updatedAt } : {}),
  };
}

export function serializeDirectoryEntries(
  directory: VirtualDirectory,
): DirectoryEntry[] {
  return (
    Object.entries(directory.contents)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, child]): DirectoryEntry => {
        if (child.type === "directory") return directoryMetadata(child);
        return { name, ...child };
      })
  );
}
