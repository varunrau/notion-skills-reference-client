export type DirectoryNode = {
  id: string;
  type: "directory";
  name: string;
  updatedAt?: string;
};

export type FileNode = {
  type: "file";
  mimeType: string;
  content: string;
};

export type UrlNode = {
  type: "url";
  url: string;
};

export type ContentNode = DirectoryNode | FileNode | UrlNode;

export type DirectoryEntry =
  | DirectoryNode
  | (FileNode & { name: string })
  | (UrlNode & { name: string });

export type PaginatedList<T> = {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
};

export type DirectoryContentsResponse = PaginatedList<DirectoryEntry> & {
  type: "content";
  content: Record<string, never>;
};

export type DirectoryResponse = DirectoryNode & {
  contents: DirectoryContentsResponse;
};

export type VirtualDirectory = DirectoryNode & {
  contents: Record<string, VirtualContentNode>;
};

export type VirtualContentNode = VirtualDirectory | FileNode | UrlNode;

export type SkillDirectory = VirtualDirectory & {
  description: string;
  updatedAt: string;
};

export type PluginDefinition = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  skillDirectories: SkillDirectory[];
};

export type WorkspaceDefinition = {
  id: string;
  name: string;
  plugins: PluginDefinition[];
};

export type SkillDirectorySummary = Pick<
  SkillDirectory,
  "id" | "name" | "description" | "updatedAt"
>;

export type PluginSummary = Omit<PluginDefinition, "skillDirectories"> & {
  skillDirectories: SkillDirectorySummary[];
};

export type PluginListResponse = PaginatedList<PluginSummary> & {
  type: "plugin";
  plugin: Record<string, never>;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
