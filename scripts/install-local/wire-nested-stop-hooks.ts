import * as v from 'valibot';

import type { ConfigDocument } from './wire-cursor.js';

const NestedDocumentSchema = v.looseObject({});

const ExecHookCommandSchema = v.looseObject({
  command: v.optional(v.string()),
  args: v.optional(v.array(v.union([v.string(), v.number(), v.boolean(), v.null()]))),
});

const CommandStringHookSchema = v.looseObject({
  command: v.optional(v.string()),
});

export function aqgStopHookHaystackIncludes(haystack: string): boolean {
  return haystack.includes('stop-hook') && haystack.includes('agent-quality-gate');
}

export function isExecFormAqgStopHook(hook: ConfigDocument): boolean {
  const parsed = v.safeParse(ExecHookCommandSchema, hook);
  if (!parsed.success) {
    return false;
  }
  const parts: string[] = [];
  if (parsed.output.command !== undefined) {
    parts.push(parsed.output.command);
  }
  for (const arg of parsed.output.args ?? []) {
    if (typeof arg === 'string') {
      parts.push(arg);
    }
  }
  return aqgStopHookHaystackIncludes(parts.join(' '));
}

export function isCommandStringAqgStopHook(hook: ConfigDocument): boolean {
  const parsed = v.safeParse(CommandStringHookSchema, hook);
  if (!parsed.success || parsed.output.command === undefined) {
    return false;
  }
  return aqgStopHookHaystackIncludes(parsed.output.command);
}

export function cloneNestedStopGroups(hooksDocument: ConfigDocument): ConfigDocument[] {
  const groupsResult = v.safeParse(v.array(NestedDocumentSchema), hooksDocument.Stop);
  const groups = groupsResult.success ? groupsResult.output : [];
  return groups.map((entry) => {
    const group: ConfigDocument = { ...entry };
    const hooksResult = v.safeParse(v.array(NestedDocumentSchema), entry.hooks);
    if (hooksResult.success) {
      group.hooks = hooksResult.output.map((hook) => ({ ...hook }));
    }
    return group;
  });
}

export function replaceNestedAqgStopHooks(
  groups: ConfigDocument[],
  nextHook: ConfigDocument,
  isAqgStopHook: (hook: ConfigDocument) => boolean,
): boolean {
  let replaced = false;
  for (const group of groups) {
    const existingHooksResult = v.safeParse(v.array(NestedDocumentSchema), group.hooks);
    if (!existingHooksResult.success) {
      continue;
    }
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

export function wireNestedStopHooksDocument(
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
  if (!replaceNestedAqgStopHooks(stop, nextHook, isAqgStopHook)) {
    stop.push({ hooks: [nextHook] });
  }
  hooks.Stop = stop;
  root.hooks = hooks;
  return root;
}
