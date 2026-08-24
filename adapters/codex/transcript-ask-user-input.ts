import { transcriptEndsWithNamedTool } from '../hooks/transcript-ends-with-named-tool.js';

const CODEX_ASK_USER_TOOL_NAMES = ['ask_user_question', 'request_user_input'] as const;

/** True when the last assistant JSONL row contains a Codex user-input tool. Fail-open on I/O or parse issues. */
export function transcriptEndsWithAskUserInput(transcriptPath: string): boolean {
  return CODEX_ASK_USER_TOOL_NAMES.some((toolName) =>
    transcriptEndsWithNamedTool(transcriptPath, toolName),
  );
}
