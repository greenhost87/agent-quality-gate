/** `mr` MCP root, `hc` host cwd, `pc` process cwd */
export const WORKSPACE_ROOT_SOURCES = ['mr', 'hc', 'pc'] as const;

export type WorkspaceRootSource = (typeof WORKSPACE_ROOT_SOURCES)[number];
