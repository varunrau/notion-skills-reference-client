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

export type DirectoryResponse = {
  directory: DirectoryNode;
  contents: Record<string, ContentNode>;
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

export type PluginListResponse = {
  plugins: PluginSummary[];
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
