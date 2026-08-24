export type CodexStopHookInput = {
  cwd: string;
  session_id: string;
  transcript_path: string | null;
  stop_hook_active: boolean;
};

export type CodexStopHookOutput = {
  decision?: 'block';
  reason?: string;
};
