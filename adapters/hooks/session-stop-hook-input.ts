import * as v from 'valibot';

export const SessionStopHookBaseSchema = v.object({
  cwd: v.pipe(v.string(), v.minLength(1)),
  session_id: v.pipe(v.string(), v.minLength(1)),
  stop_hook_active: v.boolean(),
});
