import { transcriptEndsWithNamedTool } from '../hooks/transcript-ends-with-named-tool.js';

const CURSOR_ASK_QUESTION_TOOL_NAME = 'AskQuestion';

/** True when the last assistant JSONL row contains an AskQuestion tool_use. Fail-open on I/O or parse issues. */
export function transcriptEndsWithAskQuestion(transcriptPath: string): boolean {
  return transcriptEndsWithNamedTool(transcriptPath, CURSOR_ASK_QUESTION_TOOL_NAME);
}
