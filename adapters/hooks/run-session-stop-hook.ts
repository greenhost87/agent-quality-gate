import * as v from 'valibot';

import { runStdinJsonHook } from './stdin-json-hook.js';
import type {
  SessionStopQualityGateHandler,
  SessionStopQualityGateInput,
} from './handle-session-stop-quality-gate.js';

const StdinObjectSchema = v.looseObject({});

export async function runSessionStopHookMain<
  TInput extends SessionStopQualityGateInput,
  TOutput extends object,
>(
  parseInput: (value: v.InferOutput<typeof StdinObjectSchema>) => TInput | undefined,
  handle: SessionStopQualityGateHandler<TInput, TOutput>,
): Promise<void> {
  await runStdinJsonHook(parseInput, handle);
}
