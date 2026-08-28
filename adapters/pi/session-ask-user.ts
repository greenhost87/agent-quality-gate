import * as v from 'valibot';

import { contentHasNamedTool } from '../hooks/content-has-named-tool.js';

export const PI_ASK_USER_TOOL_NAME = 'ask_user';

const PI_TOOL_CALL_TYPE = 'toolCall';

const AssistantMessageSchema = v.object({
  role: v.literal('assistant'),
  content: v.optional(v.union([v.array(v.looseObject({})), v.string()])),
});

/** True when the last assistant branch entry contains an ask_user toolCall. */
export function branchEndsWithAskUser(entries: readonly SessionBranchEntry[]): boolean {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const parsed = v.safeParse(AssistantMessageSchema, entry?.message);
    if (!parsed.success) {
      continue;
    }
    const content = parsed.output.content;
    return contentHasNamedTool(
      typeof content === 'string' ? undefined : content,
      PI_TOOL_CALL_TYPE,
      PI_ASK_USER_TOOL_NAME,
    );
  }
  return false;
}

export type SessionBranchEntry = {
  type?: string;
  message?: {
    role?: string;
    content?: object | string;
  };
};
