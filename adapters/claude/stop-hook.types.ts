export type ClaudeStopHookInput = {
  cwd: string;
  session_id: string;
  transcript_path: string;
  stop_hook_active: boolean;
  background_tasks?: unknown[];
};

export type ClaudeStopHookOutput = {
  hookSpecificOutput?: {
    hookEventName: 'Stop';
    additionalContext: string;
  };
};
