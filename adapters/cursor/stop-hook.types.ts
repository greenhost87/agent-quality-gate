export const CURSOR_STOP_HOOK_STATUSES = ['completed', 'aborted', 'error'] as const;

export type CursorStopHookStatus = (typeof CURSOR_STOP_HOOK_STATUSES)[number];

export type CursorStopHookInput = {
  status: CursorStopHookStatus;
  workspace_roots: string[];
  loop_count?: number;
  transcript_path?: string | null;
};

export type CursorStopHookOutput = {
  followup_message?: string;
};
