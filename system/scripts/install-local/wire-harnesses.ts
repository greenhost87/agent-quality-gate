import { TOML } from 'bun';
import * as v from 'valibot';

import {
  MCP_STARTUP_TIMEOUT_SECONDS,
  MCP_TOOL_TIMEOUT_SECONDS,
  STOP_HOOK_TIMEOUT_SECONDS,
} from '#system/config/tuning/tuning.js';
import {
  pathExists,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile,
} from '#system/process/files/files.js';

const MCP_SERVER_NAME = 'agent-quality-gate';
const ConfigDocumentSchema = v.looseObject({});
const NestedDocumentSchema = v.looseObject({});
const StopHookEntrySchema = v.looseObject({
  command: v.optional(v.string()),
  timeout: v.optional(v.number()),
});
const ExecHookCommandSchema = v.looseObject({
  command: v.optional(v.string()),
  args: v.optional(v.array(v.union([v.string(), v.number(), v.boolean(), v.null()]))),
});
const CommandStringHookSchema = v.looseObject({ command: v.optional(v.string()) });
const TomlDocumentSchema = v.looseObject({});

export type ConfigDocument = v.InferOutput<typeof ConfigDocumentSchema>;

function asDocument(value: ConfigDocument | undefined): ConfigDocument {
  return value ?? {};
}

function isAqgStopHookCommand(command: string): boolean {
  return command.includes('agent-quality-gate') && command.includes('stop-hook');
}

export async function readConfigDocument(path: string): Promise<ConfigDocument> {
  if (!(await pathExists(path))) {
    return {};
  }
  try {
    return await readJsonFile(path, ConfigDocumentSchema);
  } catch {
    return {};
  }
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

export function mcpServerConfig(mcpServerPath: string): ConfigDocument {
  return { type: 'stdio', command: 'bun', args: [mcpServerPath] };
}

export function stopHookCommand(stopHookPath: string): string {
  return `bun ${stopHookPath}`;
}

/** Merge agent-quality-gate into a Cursor mcp.json document. */
export function wireMcpDocument(document: ConfigDocument, mcpServerPath: string): ConfigDocument {
  const root: ConfigDocument = { ...document };
  const mcpServersResult = v.safeParse(ConfigDocumentSchema, root.mcpServers);
  const mcpServers: ConfigDocument = {
    ...asDocument(mcpServersResult.success ? mcpServersResult.output : undefined),
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
  const hooksResult = v.safeParse(ConfigDocumentSchema, root.hooks);
  const hooks: ConfigDocument = {
    ...asDocument(hooksResult.success ? hooksResult.output : undefined),
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
  const nextEntry: ConfigDocument = { command, timeout: STOP_HOOK_TIMEOUT_SECONDS };
  if (existingIndex === -1) {
    stop.push(nextEntry);
  } else {
    stop[existingIndex] = { ...stop[existingIndex], ...nextEntry };
  }
  hooks.stop = stop;
  root.hooks = hooks;
  return root;
}

export function aqgStopHookHaystackIncludes(haystack: string): boolean {
  return haystack.includes('stop-hook') && haystack.includes('agent-quality-gate');
}

export function isExecFormAqgStopHook(hook: ConfigDocument): boolean {
  const parsed = v.safeParse(ExecHookCommandSchema, hook);
  if (!parsed.success) return false;
  const parts: string[] = [];
  if (parsed.output.command !== undefined) parts.push(parsed.output.command);
  for (const arg of parsed.output.args ?? []) {
    if (typeof arg === 'string') parts.push(arg);
  }
  return aqgStopHookHaystackIncludes(parts.join(' '));
}

export function isCommandStringAqgStopHook(hook: ConfigDocument): boolean {
  const parsed = v.safeParse(CommandStringHookSchema, hook);
  return parsed.success && parsed.output.command !== undefined
    ? aqgStopHookHaystackIncludes(parsed.output.command)
    : false;
}

function cloneNestedStopGroups(hooksDocument: ConfigDocument): ConfigDocument[] {
  const groupsResult = v.safeParse(v.array(NestedDocumentSchema), hooksDocument.Stop);
  const groups = groupsResult.success ? groupsResult.output : [];
  return groups.map((entry) => {
    const group: ConfigDocument = { ...entry };
    const hooksResult = v.safeParse(v.array(NestedDocumentSchema), entry.hooks);
    if (hooksResult.success) group.hooks = hooksResult.output.map((hook) => ({ ...hook }));
    return group;
  });
}

function replaceNestedAqgStopHooks(
  groups: ConfigDocument[],
  nextHook: ConfigDocument,
  isAqgStopHook: (hook: ConfigDocument) => boolean,
): boolean {
  let replaced = false;
  for (const group of groups) {
    const existingHooksResult = v.safeParse(v.array(NestedDocumentSchema), group.hooks);
    if (!existingHooksResult.success) continue;
    const hooks = [...existingHooksResult.output];
    for (let index = 0; index < hooks.length; index += 1) {
      const hook = hooks[index];
      if (hook !== undefined && isAqgStopHook(hook)) {
        hooks[index] = { ...hook, ...nextHook };
        replaced = true;
      }
    }
    group.hooks = hooks;
  }
  return replaced;
}

function wireNestedStopHooksDocument(
  document: ConfigDocument,
  stopHookPath: string,
  createHook: (path: string) => ConfigDocument,
  isAqgStopHook: (hook: ConfigDocument) => boolean,
): ConfigDocument {
  const root: ConfigDocument = { ...document };
  const hooksResult = v.safeParse(NestedDocumentSchema, root.hooks);
  const hooks: ConfigDocument = hooksResult.success ? { ...hooksResult.output } : {};
  const stop = cloneNestedStopGroups(hooks);
  const nextHook = createHook(stopHookPath);
  if (!replaceNestedAqgStopHooks(stop, nextHook, isAqgStopHook)) stop.push({ hooks: [nextHook] });
  hooks.Stop = stop;
  root.hooks = hooks;
  return root;
}

const VERIFY_PERMISSION = 'mcp__agent-quality-gate__verify';
const StopHookConfigSchema = v.object({
  type: v.literal('command'),
  command: v.literal('bun'),
  args: v.tuple([v.string(), v.string()]),
  timeout: v.number(),
});
export type StopHookConfig = v.InferOutput<typeof StopHookConfigSchema>;

export function stopHookConfig(stopHookPath: string): StopHookConfig {
  return {
    type: 'command',
    command: 'bun',
    args: [stopHookPath, 'claude'],
    timeout: STOP_HOOK_TIMEOUT_SECONDS,
  };
}

function withVerifyPermission(document: ConfigDocument): ConfigDocument {
  const permissionsResult = v.safeParse(NestedDocumentSchema, document.permissions);
  const permissions: ConfigDocument = permissionsResult.success
    ? { ...permissionsResult.output }
    : {};
  const allowResult = v.safeParse(v.array(v.string()), permissions.allow);
  const allow = allowResult.success ? [...allowResult.output] : [];
  if (!allow.includes(VERIFY_PERMISSION)) allow.push(VERIFY_PERMISSION);
  permissions.allow = allow;
  return { ...document, permissions };
}

/** Merge the Stop hook and verify permission into a Claude settings.json document. */
export function wireClaudeSettingsDocument(
  document: ConfigDocument,
  stopHookPath: string,
): ConfigDocument {
  return withVerifyPermission(
    wireNestedStopHooksDocument(document, stopHookPath, stopHookConfig, isExecFormAqgStopHook),
  );
}

export async function writeWiredClaudeSettingsConfig(
  settingsConfigPath: string,
  stopHookPath: string,
): Promise<void> {
  const document = await readConfigDocument(settingsConfigPath);
  await writeConfigDocument(settingsConfigPath, wireClaudeSettingsDocument(document, stopHookPath));
}

export function codexMcpServerConfig(mcpServerPath: string): ConfigDocument {
  return {
    command: 'bun',
    args: [mcpServerPath],
    startup_timeout_sec: MCP_STARTUP_TIMEOUT_SECONDS,
    tool_timeout_sec: MCP_TOOL_TIMEOUT_SECONDS,
  };
}

export function codexStopHookEntry(stopHookPath: string): ConfigDocument {
  return {
    type: 'command',
    command: ['bun', stopHookPath, 'codex'].join(' '),
    timeout: STOP_HOOK_TIMEOUT_SECONDS,
  };
}

function parseTomlDocument(text: string): ConfigDocument {
  try {
    const result = v.safeParse(TomlDocumentSchema, TOML.parse(text));
    return result.success ? result.output : {};
  } catch {
    return {};
  }
}

async function readTomlDocument(path: string): Promise<ConfigDocument> {
  if (!(await pathExists(path))) return {};
  return parseTomlDocument(await readTextFile(path));
}

async function writeTomlDocument(path: string, value: ConfigDocument): Promise<void> {
  const serialized = TOML.stringify(value);
  await writeTextFile(path, serialized.endsWith('\n') ? serialized : serialized.concat('\n'));
}

/** Merge the agent-quality-gate MCP server into a Codex config.toml document. */
export function wireCodexConfigDocument(
  document: ConfigDocument,
  mcpServerPath: string,
): ConfigDocument {
  const root: ConfigDocument = { ...document };
  const mcpServersResult = v.safeParse(TomlDocumentSchema, root.mcp_servers);
  const mcpServers: ConfigDocument = mcpServersResult.success ? { ...mcpServersResult.output } : {};
  mcpServers[MCP_SERVER_NAME] = codexMcpServerConfig(mcpServerPath);
  root.mcp_servers = mcpServers;
  return root;
}

/** Merge the Stop hook into a Codex hooks.json document. */
export function wireCodexHooksDocument(
  document: ConfigDocument,
  stopHookPath: string,
): ConfigDocument {
  return wireNestedStopHooksDocument(
    document,
    stopHookPath,
    codexStopHookEntry,
    isCommandStringAqgStopHook,
  );
}

export async function writeWiredCodexConfigs(
  configPath: string,
  hooksConfigPath: string,
  mcpServerPath: string,
  stopHookPath: string,
): Promise<void> {
  await writeTomlDocument(
    configPath,
    wireCodexConfigDocument(await readTomlDocument(configPath), mcpServerPath),
  );
  await writeConfigDocument(
    hooksConfigPath,
    wireCodexHooksDocument(await readConfigDocument(hooksConfigPath), stopHookPath),
  );
}
