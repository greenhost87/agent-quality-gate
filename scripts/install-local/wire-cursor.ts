import * as v from 'valibot';

import { pathExists, readJsonFile, writeJsonFile } from '../../process/files/files.js';

const MCP_SERVER_NAME = 'agent-quality-gate';
const STOP_HOOK_TIMEOUT_SECONDS = 120;

const ConfigDocumentSchema = v.looseObject({});

export type ConfigDocument = v.InferOutput<typeof ConfigDocumentSchema>;

const McpServerConfigSchema = v.object({
  type: v.literal('stdio'),
  command: v.literal('bun'),
  args: v.tuple([v.string()]),
});

export type McpServerConfig = v.InferOutput<typeof McpServerConfigSchema>;

const StopHookEntrySchema = v.looseObject({
  command: v.optional(v.string()),
  timeout: v.optional(v.number()),
});

function asDocument(value: object | undefined): ConfigDocument {
  const result = v.safeParse(ConfigDocumentSchema, value);
  return result.success ? result.output : {};
}

function isAqgStopHookCommand(command: string): boolean {
  return command.includes('agent-quality-gate') && command.includes('stop-hook');
}

export async function readConfigDocument(path: string): Promise<ConfigDocument> {
  if (!(await pathExists(path))) {
    return {};
  }
  let parsed;
  try {
    parsed = await readJsonFile(path);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }
  return asDocument(parsed);
}

export async function writeConfigDocument(path: string, value: ConfigDocument): Promise<void> {
  await writeJsonFile(path, value);
}

export async function writeWiredConfig(
  configPath: string,
  targetPath: string,
  wire: (document: ConfigDocument, path: string) => ConfigDocument,
): Promise<void> {
  await writeConfigDocument(configPath, wire(await readConfigDocument(configPath), targetPath));
}

export function mcpServerConfig(mcpServerPath: string): McpServerConfig {
  return {
    type: 'stdio',
    command: 'bun',
    args: [mcpServerPath],
  };
}

export function stopHookCommand(stopHookPath: string): string {
  return `bun ${stopHookPath}`;
}

/** Merge agent-quality-gate into a Cursor mcp.json document. */
export function wireMcpDocument(document: ConfigDocument, mcpServerPath: string): ConfigDocument {
  const root: ConfigDocument = { ...document };
  const mcpServersValue = root.mcpServers;
  const mcpServers: ConfigDocument = {
    ...asDocument(
      typeof mcpServersValue === 'object' && mcpServersValue !== null ? mcpServersValue : undefined,
    ),
  };
  mcpServers[MCP_SERVER_NAME] = mcpServerConfig(mcpServerPath);
  root.mcpServers = mcpServers;
  return root;
}

/** Update or append the agent-quality-gate stop hook in a Cursor hooks.json document. */
export function wireHooksDocument(document: ConfigDocument, stopHookPath: string): ConfigDocument {
  const root: ConfigDocument = { ...document };
  if (root.version === undefined) {
    root.version = 1;
  }
  const hooksValue = root.hooks;
  const hooks: ConfigDocument = {
    ...asDocument(typeof hooksValue === 'object' && hooksValue !== null ? hooksValue : undefined),
  };
  const existingStop = v.safeParse(v.array(ConfigDocumentSchema), hooks.stop);
  const stop: ConfigDocument[] = existingStop.success
    ? existingStop.output.map((entry) => ({ ...entry }))
    : [];
  const command = stopHookCommand(stopHookPath);
  const existingIndex = stop.findIndex((entry) => {
    const parsed = v.safeParse(StopHookEntrySchema, entry);
    return parsed.success && parsed.output.command !== undefined
      ? isAqgStopHookCommand(parsed.output.command)
      : false;
  });
  const nextEntry: ConfigDocument = {
    command,
    timeout: STOP_HOOK_TIMEOUT_SECONDS,
  };
  if (existingIndex === -1) {
    stop.push(nextEntry);
  } else {
    stop[existingIndex] = { ...stop[existingIndex], ...nextEntry };
  }
  hooks.stop = stop;
  root.hooks = hooks;
  return root;
}
