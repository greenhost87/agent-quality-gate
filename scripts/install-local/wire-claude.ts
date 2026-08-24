import * as v from 'valibot';

import { readConfigDocument, writeConfigDocument, type ConfigDocument } from './wire-cursor.js';
import { isExecFormAqgStopHook, wireNestedStopHooksDocument } from './wire-nested-stop-hooks.js';

const STOP_HOOK_TIMEOUT_SECONDS = 120;
const VERIFY_PERMISSION = 'mcp__agent-quality-gate__verify';

const NestedDocumentSchema = v.looseObject({});

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
  if (!allow.includes(VERIFY_PERMISSION)) {
    allow.push(VERIFY_PERMISSION);
  }
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
