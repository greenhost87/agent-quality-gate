import * as v from 'valibot';

import { contentHasNamedTool } from './content-has-named-tool.js';
import { readTextFileSync } from '../../process/files/files.js';

const TOOL_USE_TYPE = 'tool_use';

const AssistantRowSchema = v.looseObject({
  role: v.optional(v.string()),
  type: v.optional(v.string()),
  content: v.optional(v.union([v.array(v.looseObject({})), v.string()])),
  message: v.optional(
    v.looseObject({
      role: v.optional(v.string()),
      content: v.optional(v.union([v.array(v.looseObject({})), v.string()])),
    }),
  ),
});
const AssistantRowJsonSchema = v.pipe(v.string(), v.parseJson(), AssistantRowSchema);

function assistantRowHasNamedTool(
  parsed: v.InferOutput<typeof AssistantRowSchema>,
  toolName: string,
): boolean | undefined {
  const role = parsed.role ?? parsed.message?.role;
  const rowType = parsed.type;
  if (role !== 'assistant' && rowType !== 'assistant') {
    return undefined;
  }
  const content = parsed.message?.content ?? parsed.content;
  return contentHasNamedTool(
    typeof content === 'string' ? undefined : content,
    TOOL_USE_TYPE,
    toolName,
  );
}

/** True when the last assistant JSONL row contains the named tool_use. Fail-open on I/O or parse issues. */
export function transcriptEndsWithNamedTool(transcriptPath: string, toolName: string): boolean {
  let raw: string;
  try {
    raw = readTextFileSync(transcriptPath);
  } catch {
    return false;
  }
  const lines = raw.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line === undefined || line.length === 0) {
      continue;
    }
    const lineResult = v.safeParse(AssistantRowJsonSchema, line);
    if (!lineResult.success) {
      continue;
    }
    const asked = assistantRowHasNamedTool(lineResult.output, toolName);
    if (asked !== undefined) {
      return asked;
    }
  }
  return false;
}
