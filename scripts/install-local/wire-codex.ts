import { TOML } from 'bun';
import * as v from 'valibot';

import { pathExists, readTextFile, writeTextFile } from '../../process/files/files.js';
import { readConfigDocument, writeConfigDocument, type ConfigDocument } from './wire-cursor.js';
import {
  isCommandStringAqgStopHook,
  wireNestedStopHooksDocument,
} from './wire-nested-stop-hooks.js';

const MCP_SERVER_NAME = 'agent-quality-gate';
const STOP_HOOK_TIMEOUT_SECONDS = 120;

const TomlDocumentSchema = v.looseObject({});

export function codexMcpServerConfig(mcpServerPath: string): ConfigDocument {
  return {
    command: 'bun',
    args: [mcpServerPath],
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
    const parsed = TOML.parse(text);
    const result = v.safeParse(TomlDocumentSchema, parsed);
    return result.success ? result.output : {};
  } catch {
    return {};
  }
}

async function readTomlDocument(path: string): Promise<ConfigDocument> {
  if (!(await pathExists(path))) {
    return {};
  }
  return parseTomlDocument(await readTextFile(path));
}

async function writeTomlDocument(path: string, value: ConfigDocument): Promise<void> {
  const serialized = String(TOML.stringify(value));
  const contents = serialized.endsWith('\n') ? serialized : serialized.concat('\n');
  await writeTextFile(path, contents);
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
