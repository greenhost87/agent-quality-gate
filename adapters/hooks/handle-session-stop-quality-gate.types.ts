import type { RegisterQualityGateOptions } from '../../gate/quality-gate-run/quality-gate-run.types.js';
import type { StopSessionHarness } from './stop-session-attempts.types.js';

export type SessionStopQualityGateInput = {
  cwd: string;
  session_id: string;
};

export type SessionStopQualityGateContext<TOutput extends object> = {
  harness: StopSessionHarness;
  shouldSkip: () => boolean;
  formatContinuation: (message: string) => TOutput;
};

export type SessionStopQualityGateHandler<
  TInput extends SessionStopQualityGateInput,
  TOutput extends object,
> = (
  input: TInput,
  options?: RegisterQualityGateOptions,
) => Promise<TOutput | Record<string, never>>;
