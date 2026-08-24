import { transcriptEndsWithNamedTool } from '../hooks/transcript-ends-with-named-tool.js';

const CLAUDE_ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion';

/** True when the last assistant JSONL row contains an AskUserQuestion tool_use. Fail-open on I/O or parse issues. */
export function transcriptEndsWithAskUserQuestion(transcriptPath: string): boolean {
  return transcriptEndsWithNamedTool(transcriptPath, CLAUDE_ASK_USER_QUESTION_TOOL_NAME);
}
